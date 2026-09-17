// ============================================================
// SAFIYA-TOYS — SERVER.JS С ПОНЯТНЫМИ КОММЕНТАРИЯМИ
// ============================================================
// Этот файл принимает запросы от frontend, работает с базой
// данных и отправляет ответы в формате JSON.

// Подключаем Express — библиотеку для создания сервера.
import express from 'express';

// Multer нужен для загрузки фотографий товаров.
import multer from 'multer';

// Эти функции нужны для создания безопасного случайного токена.
import { randomBytes, createHash } from 'node:crypto';

// resolve помогает правильно составлять пути к папкам.
import { resolve } from 'node:path';

// Функции для создания папки, чтения и удаления файлов.
import { mkdirSync, readFileSync, unlinkSync } from 'node:fs';

// Импортируем готовые функции для работы с базой данных.
import {
  root,
  all,
  one,
  run,
  hash,
  verify,
  transaction,
  cleanUser,
  product,
  order
} from './db.js';

// Создаём приложение Express.
const app = express();

// Убираем из ответа информацию о том, что сервер использует Express.
app.disable('x-powered-by');

// Разрешаем серверу принимать JSON из frontend.
app.use(express.json({ limit: '100kb' }));

// ============================================================
// 1. ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ
// ============================================================

// Создаёт ошибку и передаёт её в общий обработчик ошибок.
function fail(message, status = 400) {
  const error = new Error(message);
  error.status = status;
  throw error;
}

// Проверяет обычное текстовое поле.
function checkText(value, fieldName, maxLength = 500) {
  if (typeof value !== 'string') {
    fail('Проверьте поле «' + fieldName + '»');
  }

  const cleanValue = value.trim();

  if (cleanValue === '' || cleanValue.length > maxLength) {
    fail('Проверьте поле «' + fieldName + '»');
  }

  return cleanValue;
}

// Проверяет, что значение является целым числом.
function checkInteger(value, fieldName, min = 0, max = 100000000) {
  const number = Number(value);

  if (!Number.isSafeInteger(number) || number < min || number > max) {
    fail('Проверьте поле «' + fieldName + '»');
  }

  return number;
}

// Хешируем токен сессии перед сохранением в базе.
function makeTokenHash(token) {
  return createHash('sha256').update(token).digest('hex');
}

// Middleware проверяет, вошёл ли пользователь в аккаунт.
// Также можно указать разрешённую роль: customer, seller или courier.
function auth(...allowedRoles) {
  return function (req, res, next) {
    if (!req.user) {
      return res.status(401).json({ error: 'Войдите в аккаунт' });
    }

    if (allowedRoles.length > 0 && !allowedRoles.includes(req.user.role)) {
      return res.status(403).json({ error: 'Нет доступа к этому кабинету' });
    }

    next();
  };
}

// ============================================================
// 2. ПРОВЕРКА СЕССИИ ПОЛЬЗОВАТЕЛЯ
// ============================================================

app.use(function (req, res, next) {
  // Получаем cookie из запроса.
  const cookies = req.headers.cookie || '';

  // Ищем cookie, которая начинается с sid=.
  const sessionCookie = cookies
    .split(';')
    .map(function (cookie) {
      return cookie.trim();
    })
    .find(function (cookie) {
      return cookie.startsWith('sid=');
    });

  // Если cookie найдена, получаем токен после sid=.
  const token = sessionCookie ? sessionCookie.slice(4) : null;

  if (token) {
    req.sid = makeTokenHash(token);

    // Ищем пользователя, у которого есть действующая сессия.
    req.user = one(
      `SELECT users.*
       FROM sessions
       JOIN users ON users.id = sessions.user_id
       WHERE sessions.token = ? AND sessions.expires > ?`,
      req.sid,
      Date.now()
    );
  }

  // Передаём запрос следующему обработчику.
  next();
});

// Защищаем запросы, которые изменяют данные.
// Обычный сайт всегда отправляет этот заголовок через frontend/api.js.
app.use('/api', function (req, res, next) {
  const safeMethods = ['GET', 'HEAD', 'OPTIONS'];

  if (!safeMethods.includes(req.method) && req.get('X-Safiya-Request') !== '1') {
    return res.status(403).json({ error: 'Запрос отклонен' });
  }

  next();
});

// Создаёт новую сессию после входа или регистрации.
function createSession(res, user) {
  // Создаём случайный токен.
  const token = randomBytes(32).toString('hex');

  // Сессия будет работать 7 дней.
  const expires = Date.now() + 7 * 24 * 60 * 60 * 1000;

  // Сохраняем хеш токена в базе данных.
  run(
    'INSERT INTO sessions(token, user_id, expires) VALUES(?, ?, ?)',
    makeTokenHash(token),
    user.id,
    expires
  );

  // Отправляем токен браузеру в cookie.
  res.cookie('sid', token, {
    httpOnly: true,
    sameSite: 'strict',
    secure: process.env.COOKIE_SECURE === '1',
    maxAge: 7 * 24 * 60 * 60 * 1000,
    path: '/'
  });

  // Возвращаем пользователя без пароля.
  return cleanUser(user);
}

// ============================================================
// 3. РЕГИСТРАЦИЯ, ВХОД И ВЫХОД
// ============================================================

// Проверяем, кто сейчас вошёл в аккаунт.
app.get('/api/auth/me', function (req, res) {
  res.json({ user: cleanUser(req.user) || null });
});

// Вход пользователя.
app.post('/api/auth/login', function (req, res) {
  const email = checkText(req.body.email, 'Email', 150).toLowerCase();
  const password = checkText(req.body.password, 'Пароль', 200);

  // Ищем пользователя по email.
  const user = one('SELECT * FROM users WHERE email = ?', email);

  // verify сравнивает введённый пароль с хешем из базы.
  if (!user || !verify(password, user.password)) {
    fail('Неверный email или пароль', 401);
  }

  res.json({ user: createSession(res, user) });
});

// Регистрация покупателя.
app.post('/api/auth/register', function (req, res) {
  const name = checkText(req.body.name, 'Имя', 100);
  const email = checkText(req.body.email, 'Email', 150).toLowerCase();
  const phone = checkText(req.body.phone, 'Телефон', 30);
  const password = checkText(req.body.password, 'Пароль', 200);

  if (password.length < 8) {
    fail('Пароль должен содержать минимум 8 символов');
  }

  // Проверяем, нет ли пользователя с таким email.
  const oldUser = one('SELECT id FROM users WHERE email = ?', email);

  if (oldUser) {
    fail('Этот email уже зарегистрирован', 409);
  }

  // hash превращает пароль в безопасный хеш.
  const result = run(
    `INSERT INTO users(name, email, phone, password, role)
     VALUES(?, ?, ?, ?, ?)`,
    name,
    email,
    phone,
    hash(password),
    'customer'
  );

  // Получаем только что созданного пользователя.
  const newUser = one('SELECT * FROM users WHERE id = ?', result.lastInsertRowid);

  res.status(201).json({ user: createSession(res, newUser) });
});

// Выход пользователя.
app.post('/api/auth/logout', function (req, res) {
  if (req.sid) {
    run('DELETE FROM sessions WHERE token = ?', req.sid);
  }

  res.clearCookie('sid', { path: '/' });
  res.json({ ok: true });
});

// ============================================================
// 4. КАТЕГОРИИ И ТОВАРЫ
// ============================================================

// Возвращаем все категории.
app.get('/api/categories', function (req, res) {
  const categories = all('SELECT * FROM categories');
  res.json(categories);
});

// Возвращаем список товаров.
app.get('/api/products', function (req, res) {
  let products = all(
    `SELECT products.*, categories.name AS category
     FROM products
     JOIN categories ON products.category_id = categories.id
     WHERE products.active = 1`
  ).map(product);

  // Получаем текст поиска из адресной строки.
  const search = String(req.query.q || '').toLowerCase();

  // Оставляем только подходящие товары.
  products = products.filter(function (item) {
    const productText = (item.name + ' ' + item.description).toLowerCase();
    const correctSearch = productText.includes(search);
    const correctCategory = !req.query.category || item.category_id === Number(req.query.category);
    const correctMinPrice = !req.query.min || item.price >= Number(req.query.min);
    const correctMaxPrice = !req.query.max || item.price <= Number(req.query.max);
    const inStock = req.query.stock !== '1' || item.stock > 0;

    return correctSearch && correctCategory && correctMinPrice && correctMaxPrice && inStock;
  });

  // Сортировка товаров.
  if (req.query.sort === 'price_asc') {
    products.sort(function (a, b) {
      return a.price - b.price;
    });
  } else if (req.query.sort === 'price_desc') {
    products.sort(function (a, b) {
      return b.price - a.price;
    });
  } else {
    products.sort(function (a, b) {
      return b.popularity - a.popularity;
    });
  }

  res.json(products);
});

// Возвращаем один товар по его id.
app.get('/api/products/:id', function (req, res) {
  const foundProduct = one(
    `SELECT products.*, categories.name AS category
     FROM products
     JOIN categories ON categories.id = products.category_id
     WHERE products.id = ? AND products.active = 1`,
    req.params.id
  );

  if (!foundProduct) {
    fail('Товар не найден', 404);
  }

  res.json(product(foundProduct));
});

// ============================================================
// 5. ЗАГРУЗКА ФОТОГРАФИЙ
// ============================================================

// Папка, в которую сохраняются фотографии.
const uploadDirectory = process.env.UPLOAD_DIR || resolve(root, 'uploads');
mkdirSync(uploadDirectory, { recursive: true });

// Настройки загрузки.
const upload = multer({
  storage: multer.diskStorage({
    destination: uploadDirectory,

    // Создаём случайное имя, чтобы файлы не заменяли друг друга.
    filename: function (req, file, callback) {
      const extensions = {
        'image/png': '.png',
        'image/jpeg': '.jpg',
        'image/webp': '.webp'
      };

      const fileName = randomBytes(18).toString('hex') + extensions[file.mimetype];
      callback(null, fileName);
    }
  }),

  // Не больше 8 файлов, каждый до 5 МБ.
  limits: {
    fileSize: 5 * 1024 * 1024,
    files: 8
  },

  // Разрешаем только изображения.
  fileFilter: function (req, file, callback) {
    const allowedTypes = ['image/png', 'image/jpeg', 'image/webp'];
    callback(null, allowedTypes.includes(file.mimetype));
  }
});

// Подготавливаем данные товара перед сохранением.
function getProductData(req) {
  const name = checkText(req.body.name, 'Название', 150);
  const description = checkText(req.body.description, 'Описание', 5000);
  const categoryId = checkInteger(req.body.category_id, 'Категория', 1);
  const price = checkInteger(req.body.price, 'Цена', 1);
  const wholesalePrice = checkInteger(req.body.wholesale_price, 'Оптовая цена', 1);
  const wholesaleMin = checkInteger(req.body.wholesale_min, 'Минимум для опта', 2, 100000);
  const stock = checkInteger(req.body.stock, 'Остаток', 0, 100000);

  if (wholesalePrice >= price) {
    fail('Оптовая цена должна быть меньше розничной');
  }

  let oldImages = [];
  let specifications = {};

  try {
    oldImages = JSON.parse(req.body.kept || '[]');
    specifications = JSON.parse(req.body.specs || '{}');
  } catch (error) {
    fail('Ошибка в характеристиках или фотографиях');
  }

  const newImages = (req.files || []).map(function (file) {
    return '/uploads/' + file.filename;
  });

  const images = [...oldImages, ...newImages];

  if (images.length === 0) {
    fail('Добавьте фотографию товара');
  }

  return [
    name,
    description,
    categoryId,
    price,
    wholesalePrice,
    wholesaleMin,
    stock,
    JSON.stringify(images),
    JSON.stringify(specifications)
  ];
}

// Добавление товара. Доступно только продавцу.
app.post(
  '/api/products',
  auth('seller'),
  upload.array('photos', 8),
  function (req, res) {
    const values = getProductData(req);

    const result = run(
      `INSERT INTO products
       (name, description, category_id, price, wholesale_price, wholesale_min, stock, images, specs)
       VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ...values
    );

    const newProduct = one('SELECT * FROM products WHERE id = ?', result.lastInsertRowid);
    res.status(201).json(product(newProduct));
  }
);

// Удаление товара. Мы не стираем строку, а делаем active = 0.
app.delete('/api/products/:id', auth('seller'), function (req, res) {
  run('UPDATE products SET active = 0 WHERE id = ?', req.params.id);
  run('DELETE FROM cart WHERE product_id = ?', req.params.id);
  res.json({ ok: true });
});

// ============================================================
// 6. ИЗБРАННОЕ
// ============================================================

app.get('/api/favorites', auth('customer'), function (req, res) {
  const favorites = all(
    `SELECT products.*
     FROM favorites
     JOIN products ON products.id = favorites.product_id
     WHERE favorites.user_id = ? AND products.active = 1`,
    req.user.id
  ).map(product);

  res.json(favorites);
});

app.put('/api/favorites/:id', auth('customer'), function (req, res) {
  run(
    'INSERT OR IGNORE INTO favorites(user_id, product_id) VALUES(?, ?)',
    req.user.id,
    req.params.id
  );

  res.json({ ok: true });
});

app.delete('/api/favorites/:id', auth('customer'), function (req, res) {
  run(
    'DELETE FROM favorites WHERE user_id = ? AND product_id = ?',
    req.user.id,
    req.params.id
  );

  res.json({ ok: true });
});

// ============================================================
// 7. КОРЗИНА
// ============================================================

// Возвращает корзину определённого пользователя.
function getCart(userId) {
  return all(
    `SELECT products.*, cart.quantity, cart.purchase_type
     FROM cart
     JOIN products ON products.id = cart.product_id
     WHERE cart.user_id = ? AND products.active = 1`,
    userId
  ).map(function (item) {
    const prepared = product(item);
    prepared.unit_price = prepared.purchase_type === 'wholesale'
      ? prepared.wholesale_price
      : prepared.price;
    return prepared;
  });
}

app.get('/api/cart', auth('customer'), function (req, res) {
  res.json(getCart(req.user.id));
});

// Добавление товара или изменение количества.
app.put('/api/cart/:id', auth('customer'), function (req, res) {
  const quantity = checkInteger(req.body.quantity, 'Количество', 1, 10000);
  const purchaseType = req.body.purchase_type === 'wholesale' ? 'wholesale' : 'retail';
  const foundProduct = one('SELECT * FROM products WHERE id = ?', req.params.id);

  if (!foundProduct) {
    fail('Товар не найден', 404);
  }

  if (quantity > foundProduct.stock) {
    fail('Недостаточно товара на складе');
  }

  if (purchaseType === 'wholesale' && quantity < foundProduct.wholesale_min) {
    fail('Для оптовой покупки нужно минимум ' + foundProduct.wholesale_min + ' шт.');
  }

  run(
    `INSERT INTO cart(user_id, product_id, quantity, purchase_type)
     VALUES(?, ?, ?, ?)
     ON CONFLICT(user_id, product_id)
     DO UPDATE SET quantity = excluded.quantity,
                   purchase_type = excluded.purchase_type`,
    req.user.id,
    req.params.id,
    quantity,
    purchaseType
  );

  res.json({ ok: true });
});

app.delete('/api/cart/:id', auth('customer'), function (req, res) {
  run(
    'DELETE FROM cart WHERE user_id = ? AND product_id = ?',
    req.user.id,
    req.params.id
  );

  res.json({ ok: true });
});

// ============================================================
// 8. ОФОРМЛЕНИЕ ЗАКАЗА
// ============================================================

app.post('/api/orders', auth('customer'), function (req, res) {
  const client = {
    name: checkText(req.body.name, 'Имя', 100),
    phone: checkText(req.body.phone, 'Телефон', 30),
    address: checkText(req.body.address, 'Адрес', 300),
    comment: String(req.body.comment || '').slice(0, 1000),
    payment: req.body.payment
  };

  // transaction отменит все изменения, если возникнет ошибка.
  const orderId = transaction(function () {
    const items = getCart(req.user.id);

    if (items.length === 0) {
      fail('Корзина пуста');
    }

    // Проверяем остаток и уменьшаем его.
    items.forEach(function (item) {
      if (item.quantity > item.stock) {
        fail('Недостаточно товара: ' + item.name);
      }

      run(
        'UPDATE products SET stock = stock - ? WHERE id = ?',
        item.quantity,
        item.id
      );
    });

    // Считаем общую сумму.
    const total = items.reduce(function (sum, item) {
      return sum + item.unit_price * item.quantity;
    }, 0);

    const now = new Date().toISOString();

    const result = run(
      `INSERT INTO orders
       (user_id, client, items, total, status, created, updated)
       VALUES(?, ?, ?, ?, ?, ?, ?)`,
      req.user.id,
      JSON.stringify(client),
      JSON.stringify(items.map(function (item) {
        return { ...item, price: item.unit_price };
      })),
      total,
      'Новый',
      now,
      now
    );

    // После оформления очищаем корзину.
    run('DELETE FROM cart WHERE user_id = ?', req.user.id);

    return Number(result.lastInsertRowid);
  });

  res.status(201).json({ id: orderId });
});

// Возвращаем заказы в зависимости от роли.
app.get('/api/orders', auth(), function (req, res) {
  let orders;

  if (req.user.role === 'seller') {
    orders = all('SELECT * FROM orders ORDER BY id DESC');
  } else if (req.user.role === 'customer') {
    orders = all(
      'SELECT * FROM orders WHERE user_id = ? ORDER BY id DESC',
      req.user.id
    );
  } else {
    orders = all(
      'SELECT * FROM orders WHERE courier_id = ? ORDER BY id DESC',
      req.user.id
    );
  }

  res.json(orders.map(order));
});

// Продавец меняет статус или назначает курьера.
app.patch('/api/orders/:id', auth('seller'), function (req, res) {
  const foundOrder = one('SELECT * FROM orders WHERE id = ?', req.params.id);

  if (!foundOrder) {
    fail('Заказ не найден', 404);
  }

  const newStatus = req.body.status || (req.body.courier_id ? 'Передан курьеру' : foundOrder.status);
  const courierId = req.body.courier_id || foundOrder.courier_id;
  const available = req.body.available === undefined
    ? foundOrder.available
    : Number(Boolean(req.body.available));

  // При отмене заказа возвращаем товары на склад только один раз.
  if (newStatus === 'Отменен') {
    if (foundOrder.status === 'Отменен') fail('Заказ уже отменен', 400);
    if (foundOrder.status === 'Завершен') fail('Завершенный заказ нельзя отменить', 400);

    transaction(function () {
      const items = order(foundOrder).items;

      items.forEach(function (item) {
        run('UPDATE products SET stock = stock + ? WHERE id = ?', item.quantity, item.id);
      });

      run(
        `UPDATE orders
         SET status = ?, courier_id = ?, available = 0, updated = ?
         WHERE id = ?`,
        newStatus,
        courierId,
        new Date().toISOString(),
        req.params.id
      );
    });

    res.json({ ok: true });
    return;
  }

  run(
    `UPDATE orders
     SET status = ?, courier_id = ?, available = ?, updated = ?
     WHERE id = ?`,
    newStatus,
    courierId,
    available,
    new Date().toISOString(),
    req.params.id
  );

  res.json({ ok: true });
});

// Редактирование существующего товара.
app.put(
  '/api/products/:id',
  auth('seller'),
  upload.array('photos', 8),
  function (req, res) {
    const foundProduct = one(
      'SELECT id FROM products WHERE id = ? AND active = 1',
      req.params.id
    );

    if (!foundProduct) {
      fail('Товар не найден', 404);
    }

    const values = getProductData(req);

    run(
      `UPDATE products
       SET name = ?, description = ?, category_id = ?, price = ?,
           wholesale_price = ?, wholesale_min = ?, stock = ?, images = ?, specs = ?
       WHERE id = ?`,
      ...values,
      req.params.id
    );

    res.json({ ok: true });
  }
);

// ============================================================
// 9. КАБИНЕТ КУРЬЕРА
// ============================================================

// Курьер получает назначенные и доступные заказы.
app.get('/api/deliveries', auth('courier'), function (req, res) {
  const orders = all(
    `SELECT * FROM orders
     WHERE courier_id = ?
        OR (courier_id IS NULL AND available = 1)
     ORDER BY id DESC`,
    req.user.id
  );

  res.json(orders.map(order));
});

// Курьер принимает заказ или изменяет статус доставки.
app.patch('/api/deliveries/:id', auth('courier'), function (req, res) {
  const foundOrder = one('SELECT * FROM orders WHERE id = ?', req.params.id);

  if (!foundOrder) {
    fail('Заказ не найден', 404);
  }

  const action = req.body.action;
  let newStatus = foundOrder.status;
  let courierId = foundOrder.courier_id;

  if (action === 'accept') {
    if (!foundOrder.available || foundOrder.courier_id) {
      fail('Этот заказ нельзя принять', 403);
    }
    newStatus = 'Передан курьеру';
    courierId = req.user.id;
  } else if (action === 'travel') {
    if (foundOrder.courier_id !== req.user.id || foundOrder.status !== 'Передан курьеру') {
      fail('Сначала примите назначенный заказ');
    }
    newStatus = 'Доставляется';
  } else if (action === 'done') {
    if (foundOrder.courier_id !== req.user.id) {
      fail('Заказ назначен другому курьеру', 403);
    }
    if (foundOrder.status !== 'Доставляется') {
      fail('Сначала отметьте, что заказ в пути');
    }
    newStatus = 'Завершен';
  } else if (action === 'failed') {
    if (foundOrder.courier_id !== req.user.id || !['Передан курьеру', 'Доставляется'].includes(foundOrder.status)) {
      fail('Нельзя вернуть этот заказ');
    }
    newStatus = 'В обработке';
    courierId = null;
  } else {
    fail('Неизвестное действие курьера');
  }

  run(
    `UPDATE orders
     SET status = ?, courier_id = ?, available = 0,
         updated = ?, delivered = ?
     WHERE id = ?`,
    newStatus,
    courierId,
    new Date().toISOString(),
    newStatus === 'Завершен' ? new Date().toISOString() : null,
    req.params.id
  );

  res.json({ ok: true });
});

// ============================================================
// 10. ПОЛЬЗОВАТЕЛИ И СТАТИСТИКА
// ============================================================

// Продавец получает список пользователей.
app.get('/api/users', auth('seller'), function (req, res) {
  const users = all('SELECT id, name, phone, email, role FROM users');

  res.json(users);
});

// Пользователь изменяет своё имя и телефон.
app.patch('/api/users/me', auth(), function (req, res) {
  const name = checkText(req.body.name, 'Имя', 100);
  const phone = checkText(req.body.phone, 'Телефон', 30);

  run(
    'UPDATE users SET name = ?, phone = ? WHERE id = ?',
    name,
    phone,
    req.user.id
  );

  const updatedUser = one('SELECT * FROM users WHERE id = ?', req.user.id);
  res.json({ user: cleanUser(updatedUser) });
});

// Статистика для кабинета продавца.
app.get('/api/stats', auth('seller'), function (req, res) {
  const productsCount = one(
    'SELECT COUNT(*) AS count FROM products WHERE active = 1'
  ).count;

  const ordersCount = one(
    'SELECT COUNT(*) AS count FROM orders'
  ).count;

  const clientsCount = one(
    "SELECT COUNT(*) AS count FROM users WHERE role = 'customer'"
  ).count;

  const revenue = one(
    "SELECT COALESCE(SUM(total), 0) AS total FROM orders WHERE status = 'Завершен'"
  ).total;

  res.json({
    products: productsCount,
    orders: ordersCount,
    clients: clientsCount,
    revenue: revenue,
    days: []
  });
});

// ============================================================
// 11. СТАТИЧЕСКИЕ ФАЙЛЫ И ЗАПУСК
// ============================================================

// Разрешаем браузеру получать картинки, CSS и JavaScript.
app.use(express.static(resolve(root, 'public'), {
  etag: false,
  maxAge: 0,
  setHeaders(res) {
    res.setHeader('Cache-Control', 'no-store');
  }
}));
app.use('/assets', express.static(resolve(root, 'public/assets'), {
  etag: false,
  maxAge: 0,
  setHeaders(res) {
    res.setHeader('Cache-Control', 'no-store');
  }
}));
app.use('/uploads', express.static(uploadDirectory));
app.use('/frontend', express.static(resolve(root, 'frontend'), {
  etag: false,
  maxAge: 0,
  setHeaders(res) {
    res.setHeader('Cache-Control', 'no-store');
  }
}));

// Главная страница сайта.
app.get('/', function (req, res) {
  res.sendFile(resolve(root, 'frontend/index.html'));
});

// Отдельные адреса кабинетов с проверкой роли.
app.get('/seller', auth('seller'), function (req, res) {
  res.sendFile(resolve(root, 'frontend/index.html'));
});

app.get('/courier', auth('courier'), function (req, res) {
  res.sendFile(resolve(root, 'frontend/index.html'));
});

// Если адрес не найден.
app.use(function (req, res) {
  res.status(404).json({ error: 'Страница не найдена' });
});

// Общий обработчик ошибок.
app.use(function (error, req, res, next) {
  const status = error.status || 500;
  const message = error.status ? error.message : 'Ошибка сервера';

  res.status(status).json({ error: message });
});

// Порт, на котором запускается сайт.
const PORT = Number(process.env.PORT) || 3000;
const HOST = process.env.HOST || '127.0.0.1';

// Запускаем сервер.
app.listen(PORT, HOST, function () {
  const address = this.address();
  const activePort = address && typeof address === 'object' ? address.port : PORT;
  console.log('Safiya-Toys работает: http://localhost:' + activePort);
});
 
