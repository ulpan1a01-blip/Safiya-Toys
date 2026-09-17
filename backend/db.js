// ============================================================
// SAFIYA-TOYS — DB.JS С ПОНЯТНЫМИ КОММЕНТАРИЯМИ
// ============================================================
// Этот файл отвечает за базу данных SQLite:
// 1. создаёт файл базы данных;
// 2. создаёт таблицы;
// 3. содержит функции для SQL-запросов;
// 4. шифрует и проверяет пароли;
// 5. добавляет начальных пользователей, категории и товары.

// DatabaseSync позволяет работать с SQLite в Node.js.
import { DatabaseSync } from 'node:sqlite';

// mkdirSync создаёт папку, если её ещё нет.
import { mkdirSync } from 'node:fs';

// resolve правильно соединяет части пути к папке или файлу.
import { resolve } from 'node:path';

// Функции для безопасной работы с паролями.
import {
  randomBytes,
  scryptSync,
  timingSafeEqual
} from 'node:crypto';

// ============================================================
// 1. СОЗДАНИЕ ПАПКИ И БАЗЫ ДАННЫХ
// ============================================================

// import.meta.dirname — папка, в которой находится db.js.
// '..' означает: перейти на один уровень выше.
// В результате root указывает на главную папку проекта.
export const root = resolve(import.meta.dirname, '..');

// Путь к папке database.
// Если DATA_DIR задан в настройках сервера, используем его.
// Если не задан — используем обычную папку database в проекте.
const databaseDirectory = process.env.DATA_DIR || resolve(root, 'database');

// Создаём папку database.
// recursive: true не выдаёт ошибку, если папка уже существует.
mkdirSync(databaseDirectory, { recursive: true });

// Полный путь к файлу базы данных.
const databaseFile = resolve(databaseDirectory, 'shop.sqlite');

// Открываем базу данных.
// Если shop.sqlite ещё не существует, он создастся автоматически.
export const db = new DatabaseSync(databaseFile);

// ============================================================
// 2. СОЗДАНИЕ ТАБЛИЦ
// ============================================================

db.exec(`
  -- WAL помогает базе лучше работать с несколькими запросами.
  PRAGMA journal_mode = WAL;

  -- Включаем связи между таблицами через FOREIGN KEY.
  PRAGMA foreign_keys = ON;

  -- Таблица пользователей.
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY,
    name TEXT NOT NULL,
    phone TEXT NOT NULL,
    email TEXT UNIQUE NOT NULL,
    password TEXT NOT NULL,
    role TEXT NOT NULL
      CHECK(role IN ('customer', 'seller', 'courier'))
  );

  -- Таблица сессий.
  -- Она запоминает, какой пользователь вошёл в аккаунт.
  CREATE TABLE IF NOT EXISTS sessions (
    token TEXT PRIMARY KEY,
    user_id INTEGER REFERENCES users(id),
    expires INTEGER
  );

  -- Категории товаров.
  CREATE TABLE IF NOT EXISTS categories (
    id INTEGER PRIMARY KEY,
    name TEXT UNIQUE
  );

  -- Таблица товаров.
  CREATE TABLE IF NOT EXISTS products (
    id INTEGER PRIMARY KEY,
    name TEXT NOT NULL,
    description TEXT NOT NULL,
    category_id INTEGER REFERENCES categories(id),
    price INTEGER CHECK(price > 0),
    wholesale_price INTEGER CHECK(wholesale_price > 0),
    wholesale_min INTEGER DEFAULT 5 CHECK(wholesale_min > 0),
    stock INTEGER CHECK(stock >= 0),
    images TEXT NOT NULL,
    specs TEXT NOT NULL,
    popularity INTEGER DEFAULT 0,
    active INTEGER DEFAULT 1
  );

  -- Избранные товары покупателей.
  CREATE TABLE IF NOT EXISTS favorites (
    user_id INTEGER REFERENCES users(id),
    product_id INTEGER REFERENCES products(id),

    -- Один пользователь не может добавить один товар два раза.
    PRIMARY KEY(user_id, product_id)
  );

  -- Корзина покупателя.
  CREATE TABLE IF NOT EXISTS cart (
    user_id INTEGER REFERENCES users(id),
    product_id INTEGER REFERENCES products(id),
    quantity INTEGER CHECK(quantity > 0),
    purchase_type TEXT DEFAULT 'retail'
      CHECK(purchase_type IN ('retail', 'wholesale')),

    -- Одна строка корзины для одного товара пользователя.
    PRIMARY KEY(user_id, product_id)
  );

  -- Таблица заказов.
  CREATE TABLE IF NOT EXISTS orders (
    id INTEGER PRIMARY KEY,
    user_id INTEGER REFERENCES users(id),
    client TEXT,
    items TEXT,
    total INTEGER,
    status TEXT,
    courier_id INTEGER REFERENCES users(id),
    available INTEGER DEFAULT 0,
    created TEXT,
    updated TEXT,
    delivered TEXT
  );
`);

// Обновляем старую базу, если проект уже запускался до добавления оптовых цен.
const productColumns = db.prepare('PRAGMA table_info(products)').all().map(column => column.name);
if (!productColumns.includes('wholesale_price')) {
  db.exec('ALTER TABLE products ADD COLUMN wholesale_price INTEGER');
  db.exec('UPDATE products SET wholesale_price = MAX(1, ROUND(price * 0.85))');
}
if (!productColumns.includes('wholesale_min')) {
  db.exec('ALTER TABLE products ADD COLUMN wholesale_min INTEGER DEFAULT 5');
}

const cartColumns = db.prepare('PRAGMA table_info(cart)').all().map(column => column.name);
if (!cartColumns.includes('purchase_type')) {
  db.exec("ALTER TABLE cart ADD COLUMN purchase_type TEXT DEFAULT 'retail'");
}

// ============================================================
// 3. ПРОСТЫЕ ФУНКЦИИ ДЛЯ SQL-ЗАПРОСОВ
// ============================================================

// all() возвращает все найденные строки.
// Пример: all('SELECT * FROM products')
export function all(sql, ...values) {
  const statement = db.prepare(sql);
  return statement.all(...values);
}

// one() возвращает только одну найденную строку.
// Пример: one('SELECT * FROM users WHERE id = ?', 1)
export function one(sql, ...values) {
  const statement = db.prepare(sql);
  return statement.get(...values);
}

// run() выполняет INSERT, UPDATE или DELETE.
// Пример: run('DELETE FROM cart WHERE user_id = ?', 1)
export function run(sql, ...values) {
  const statement = db.prepare(sql);
  return statement.run(...values);
}

// ============================================================
// 4. ХЕШИРОВАНИЕ И ПРОВЕРКА ПАРОЛЯ
// ============================================================

// Нельзя сохранять пароль обычным текстом.
// hash() превращает пароль в длинную безопасную строку.
export function hash(password) {
  // Создаём случайную соль.
  const salt = randomBytes(16).toString('hex');

  // На основе пароля и соли создаём хеш.
  const passwordHash = scryptSync(password, salt, 64).toString('hex');

  // Сохраняем соль и хеш через двоеточие.
  return salt + ':' + passwordHash;
}

// verify() проверяет пароль во время входа.
export function verify(password, savedValue) {
  // Разделяем сохранённую строку на соль и хеш.
  const parts = savedValue.split(':');
  const salt = parts[0];
  const savedHash = parts[1];

  // Создаём хеш введённого пароля с той же солью.
  const enteredHash = scryptSync(password, salt, 64);

  // Превращаем сохранённый хеш обратно в Buffer.
  const savedHashBuffer = Buffer.from(savedHash, 'hex');

  // Безопасно сравниваем два значения.
  return timingSafeEqual(savedHashBuffer, enteredHash);
}

// ============================================================
// 5. ТРАНЗАКЦИЯ
// ============================================================

// Транзакция объединяет несколько SQL-команд в одну операцию.
// Если одна команда выдаст ошибку, изменения отменятся.
export function transaction(callback) {
  // Начинаем транзакцию.
  db.exec('BEGIN IMMEDIATE');

  try {
    // Выполняем переданную функцию.
    const result = callback();

    // Если ошибки нет, сохраняем изменения.
    db.exec('COMMIT');

    return result;
  } catch (error) {
    // Если произошла ошибка, отменяем изменения.
    db.exec('ROLLBACK');

    // Передаём ошибку дальше.
    throw error;
  }
}

// ============================================================
// 6. ПОДГОТОВКА ДАННЫХ ПЕРЕД ОТПРАВКОЙ НА FRONTEND
// ============================================================

// Убираем пароль перед отправкой пользователя в браузер.
export function cleanUser(user) {
  if (!user) {
    return null;
  }

  return {
    id: user.id,
    name: user.name,
    phone: user.phone,
    email: user.email,
    role: user.role
  };
}

// В SQLite массив картинок и объект характеристик хранятся
// как обычный текст JSON. Здесь превращаем их обратно.
export function product(item) {
  if (!item) {
    return null;
  }

  return {
    ...item,
    images: JSON.parse(item.images),
    specs: JSON.parse(item.specs)
  };
}

// То же самое делаем с клиентом и товарами заказа.
export function order(item) {
  return {
    ...item,
    client: JSON.parse(item.client),
    items: JSON.parse(item.items)
  };
}

// ============================================================
// 7. ДОБАВЛЕНИЕ НАЧАЛЬНЫХ ДАННЫХ
// ============================================================

// Проверяем, есть ли хотя бы один пользователь.
const firstUser = one('SELECT id FROM users LIMIT 1');

// Если пользователей нет, база новая и её нужно заполнить.
if (!firstUser) {
  // ----------------------------------------------------------
  // 7.1. Начальные пользователи
  // ----------------------------------------------------------

  const seedPassword = process.env.SEED_PASSWORD;

  if (!seedPassword || seedPassword.length < 12) {
    throw new Error('SEED_PASSWORD должен содержать не менее 12 символов');
  }

  const startUsers = [
    {
      name: 'Алия',
      role: 'customer'
    },
    {
      name: 'Сотрудник Safiya',
      role: 'seller'
    },
    {
      name: 'Арман',
      role: 'courier'
    }
  ];

  startUsers.forEach(function (user) {
    run(
      `INSERT INTO users(name, phone, email, password, role)
       VALUES(?, ?, ?, ?, ?)`,
      user.name,
      '+7 700 123 45 67',
      user.role + '@safiya.test',
      hash(seedPassword),
      user.role
    );
  });

  // ----------------------------------------------------------
  // 7.2. Начальные категории
  // ----------------------------------------------------------

  const startCategories = [
    'Мягкие игрушки',
    'Машинки',
    'Куклы',
    'Конструкторы',
    'Развивающие',
    'Спорт и игры',
    'Для малышей',
    'Новинки'
  ];

  startCategories.forEach(function (categoryName) {
    run(
      'INSERT INTO categories(name) VALUES(?)',
      categoryName
    );
  });

  // ----------------------------------------------------------
  // 7.3. Начальные товары
  // ----------------------------------------------------------

  const startProducts = [
    {
      name: 'Мишка плюшевый',
      price: 8990,
      wholesalePrice: 7200,
      wholesaleMin: 5,
      stock: 15,
      categoryId: 1,
      image: 'teddy',
      description: 'Мягкий и уютный мишка станет лучшим другом для вашего ребёнка.'
    },
    {
      name: 'Машинка на пульте',
      price: 12990,
      wholesalePrice: 10500,
      wholesaleMin: 5,
      stock: 8,
      categoryId: 2,
      image: 'car',
      description: 'Красная гоночная машинка для увлекательных заездов.'
    },
    {
      name: 'Кукла Принцесса',
      price: 9490,
      wholesalePrice: 7900,
      wholesaleMin: 5,
      stock: 12,
      categoryId: 3,
      image: 'doll',
      description: 'Нарядная кукла в сиреневом платье для сюжетных игр.'
    },
    {
      name: 'Конструктор LEGO',
      price: 15990,
      wholesalePrice: 13000,
      wholesaleMin: 4,
      stock: 5,
      categoryId: 4,
      image: 'blocks',
      description: 'Яркие детали для строительства и развития воображения.'
    },
    {
      name: 'Динозавр',
      price: 6990,
      wholesalePrice: 5700,
      wholesaleMin: 5,
      stock: 10,
      categoryId: 5,
      image: 'dino',
      description: 'Зелёный динозавр для маленьких исследователей.'
    },
    {
      name: 'Футбольный мяч',
      price: 5990,
      wholesalePrice: 4900,
      wholesaleMin: 5,
      stock: 20,
      categoryId: 6,
      image: 'ball',
      description: 'Классический мяч для подвижных игр во дворе.'
    }
  ];

  // Одинаковые характеристики для учебных товаров.
  const defaultSpecifications = {
    'Возраст': '3+',
    'Назначение': 'Для игр',
    'Комплектация': '1 игрушка'
  };

  startProducts.forEach(function (item, index) {
    // SQLite не хранит массив напрямую, поэтому используем JSON.stringify.
    const images = JSON.stringify([
      '/assets/products/' + item.image + '.png'
    ]);

    const specifications = JSON.stringify(defaultSpecifications);

    // Первый товар получает популярность 100, второй — 90 и так далее.
    const popularity = 100 - index * 10;

    run(
      `INSERT INTO products
       (name, price, wholesale_price, wholesale_min, stock, category_id, images, description, specs, popularity)
       VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      item.name,
      item.price,
      item.wholesalePrice,
      item.wholesaleMin,
      item.stock,
      item.categoryId,
      images,
      item.description,
      specifications,
      popularity
    );
  });
}
