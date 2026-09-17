// Safiya-Toys — главный JavaScript-файл сайта.
// В этом файле находятся страницы покупателя, продавца и курьера,
// обработка кнопок, форм, корзины, заказов и фотографий товаров.

import {
  api,money,esc,image,date
}
from './api.js';

// Короткая функция для поиска HTML-элемента по CSS-селектору.
// Также сразу находим основной блок страницы и модальное окно.
const $=s=>document.querySelector(s), main=$('#main'),modal=$('#dialog');

// Путь к папке с изображениями, функция логотипа и функция иконок.
const base='/assets/images/',logo=()=>image(base+'SafiyaTpng2.png','Safiya-Toys','logo');
const icon=n=>image(base+n+'.png','','icon');

// Основные данные приложения.
// Здесь хранятся пользователь, товары, корзина, заказы и текущая страница.
let user=null,categories=[],products=[],favorites=[],cart=[],orders=[],users=[],page='home',events=null,requestNumber=0;

// Пункты меню для покупателя.
const customerNav=[['home','Главная','icon1'],['catalog','Каталог','icon5'],['favorites','Избранное','icon4'],['cart','Корзина','icon1'],['profile','Профиль','icon3']];

// Пункты меню для продавца.
const sellerNav=[['dashboard','Главная','inst2'],['products','Товары','icon5'],['orders','Заказы','icon1'],['clients','Клиенты','icon3'],['stats','Статистика','icon4'],['settings','Настройки','icon2']];

// Пункты меню для курьера.
const courierNav=[['available','Доступные','icon5'],['deliveries','Мои доставки','icon1'],['history','История','icon4'],['profile','Профиль','icon3']];

// Определяет стартовую страницу в зависимости от роли пользователя.
const defaultPage=()=>user?.role==='seller'?'dashboard':user?.role==='courier'?'deliveries':'home';

// Создаёт одну ссылку для нижнего меню.
const link=(key,label,ic)=>`<a class="${page===key?'active':''}" href="#${key}">${icon(ic)}<span>${label}</span></a>`;

// Показывает небольшое сообщение на 3,5 секунды.
function toast(message){
  $('#toast').textContent=message;
  $('#toast').style.display='block';
  clearTimeout(toast.timer);
  toast.timer=setTimeout(()=>$('#toast').style.display='none',3500);
}

// Открывает модальное окно и помещает в него переданный HTML.
function showDialog(html){
  $('#dialog-body').innerHTML=html;
  modal.showModal();
}

// Переходит на нужную страницу через адрес после символа #.
function go(key){
  if(location.hash.slice(1)===key)render();
  else location.hash=key;
}

// Обновляет общую оболочку сайта: шапку, боковое и нижнее меню.
// Вид меню зависит от роли пользователя.
function shell(){
  const staff=user&&user.role!=='customer';
  document.body.classList.toggle('staff',!!staff);
  document.body.classList.toggle('customer',!staff);
  const nav=user?.role==='seller'?sellerNav:user?.role==='courier'?courierNav:customerNav;
  $('#header').innerHTML=`<div class="header-inner"><button class="icon-button menu-button" data-action="menu" aria-label="Меню">${icon('icon2')}</button><a class="logo-link" href="#${defaultPage()}">${logo()}</a><span class="city">Туркестан</span>${!staff?'<nav class="desktop-nav"><a href="#home">Главная</a><a href="#catalog">Каталог</a><a href="#favorites">Избранное</a></nav>':''}<div class="header-right">${staff?`<span>${
    esc(user.name)
  }
  </span>`:`<a class="icon-button" href="#cart" aria-label="Корзина">${
    icon('icon1')
  }
  <span class="label">Корзина</span> <b id="cart-count">${
    cart.reduce((s,p)=>s+p.quantity,0)
  }
  </b></a>`}<a class="icon-button profile-link" href="#profile">${icon('icon3')}<span>${user?'Профиль':'Войти'}</span></a></div></div>`;
  $('#sidebar').innerHTML=staff?`${logo()}${nav.map(([k,t,i])=>`<a class="side-link ${page===k?'active':''}" href="#${k}">${
    icon(i)
  }
  ${
    t
  }
  </a>`).join('')}<button class="side-link" data-action="logout">${icon('icon2')}Выйти</button>`:'';
  $('#bottom').innerHTML=nav.slice(0,5).map(([k,t,i])=>link(k,t,i)).join('');
  if(user?.role==='seller')$('#header .profile-link').href='#settings';
}

// Загружает избранное и корзину покупателя.
// Для продавца и курьера эти массивы очищаются.
async function refreshUserData(){
  if(user?.role==='customer')[favorites,cart]=await Promise.all([api('/favorites'),api('/cart')]);
  else{
    favorites=[];
    cart=[];
  }
}

// Подключается к событиям сервера.
// При изменении данных автоматически обновляет открытую страницу.
function connect(){
  events?.close();
  if(!user)return;
  events=new EventSource('/api/events');
  events.onmessage=()=>{
    if(['orders','deliveries','available','history','profile','dashboard','stats','clients','products','home','catalog','favorites','cart'].includes(page)&&!modal.open)render(false);
  }
  ;
}

// Создаёт кнопку добавления товара в избранное.
const favoriteButton=p=>`<button class="favorite ${favorites.some(f=>f.id===p.id)?'selected':''}" data-action="favorite" data-id="${p.id}" aria-pressed="${favorites.some(f=>f.id===p.id)}" aria-label="В избранное: ${esc(p.name)}">${image('/assets/products/heart-'+(favorites.some(f=>f.id===p.id)?'on':'off')+'.png','')}</button>`;

// Создаёт HTML одной карточки товара.
const card=p=>`<article class="product">${favoriteButton(p)}<a href="#product/${p.id}"><div class="photo">${image(p.images[0],p.name)}</div><h3>${esc(p.name)}</h3></a><div class="product-prices"><strong>${money(p.price)} <small>розница</small></strong><span>${money(p.wholesale_price)} <small>оптом от ${p.wholesale_min} шт.</small></span></div><div class="buy-buttons"><button class="primary" data-action="add" data-purchase="retail" data-id="${p.id}" ${p.stock?'':'disabled'}>${p.stock?'В розницу':'Нет в наличии'}</button><button data-action="add" data-purchase="wholesale" data-id="${p.id}" ${p.stock>=p.wholesale_min?'':'disabled'}>Оптом</button></div></article>`;

// Создаёт сетку карточек товаров.
const grid=rows=>rows.length?`<div class="grid">${rows.map(card).join('')}</div>`:'<div class="empty">Здесь пока нет товаров</div>';

// Создаёт список категорий с картинками.
const categoryImages={
  'Мягкие игрушки':'soft-toys.png',
  'Машинки':'cars.png',
  'Куклы':'dolls.png',
  'Конструкторы':'constructors.png',
  'Развивающие':'educational.png',
  'Спорт и игры':'sport-games.png',
  'Для малышей':'for-babies.png',
  'Новинки':'new-items.png'
};

const categoriesHTML=()=>`<section class="category-section"><h2><span>♥</span> Категории товаров <span>♥</span></h2><div class="categories">${categories.map(c=>{const file=categoryImages[c.name]||'new-items.png';return `<a class="category" href="#catalog/${c.id}">${
  image('/assets/categories/'+file+'?v=20260916-2',c.name)
}
${
  esc(c.name)
}
</a>`;}).join('')}</div></section>`;

// Создаёт форму поиска товаров.
const searchForm=()=>`<form id="search-form" class="search"><input name="q" type="search" aria-label="Поиск игрушек" placeholder="Поиск игрушек…" value="${esc(new URLSearchParams(location.hash.split('?')[1]).get('q')||'')}"></form>`;

// Главная функция отрисовки страниц.
// Она проверяет адрес, роль пользователя, загружает данные и показывает нужный экран.
async function render(showLoading=true){
  const req=++requestNumber;
  const hash=location.hash.slice(1)||defaultPage();
  page=hash.split(/[/?]/)[0];
  const staff=user&&user.role!=='customer';
  const allowed=staff?(user.role==='seller'?sellerNav:courierNav).map(n=>n[0]):customerNav.map(n=>n[0]).concat(['product','login','register','terms']);
  if(!allowed.includes(page)){
    go(defaultPage());
    return;
  }
  shell();
  document.body.classList.remove('menu-open');
  if(showLoading)main.innerHTML='<p class="empty">Загрузка…</p>';
  try{
    await refreshUserData();
    if(req!==requestNumber)return;
    const productPage=['home','catalog','favorites','cart','product'].includes(page);
    if(productPage)products=await api('/products');
    if(req!==requestNumber)return;
    shell();
    let html='';
    if(page==='home')html=`<div class="mobile-city">Туркестан</div>${searchForm()}<section class="hero"><div class="hero-copy"><h1>Большое счастье<br>в маленьких игрушках</h1><a href="#catalog">Смотреть</a></div><div class="hero-emoji" aria-label="Плюшевый медведь">🧸</div></section>${categoriesHTML()}<div class="section-head"><h2>Популярное</h2><a href="#catalog">Все товары</a></div>${grid(products.slice(0,6))}`;
    if(page==='catalog'){
      const category=Number(hash.split('/')[1]?.split('?')[0]||0);
      html=`<h1>Игрушки</h1>${searchForm()}<div class="chips"><button class="chip ${!category?'active':''}" data-action="category" data-id="0">Все</button>${categories.map(c=>`<button class="chip ${c.id===category?'active':''}" data-action="category" data-id="${c.id}">${
        esc(c.name)
      }
      </button>`).join('')}</div><form id="filters" class="filters"><input type="hidden" name="category" value="${category||''}"><input type="number" min="0" name="min" aria-label="Цена от" placeholder="Цена от"><input type="number" min="0" name="max" aria-label="Цена до" placeholder="Цена до"><select name="sort" aria-label="Сортировка"><option value="popular">Популярное</option><option value="price_asc">Сначала дешевле</option><option value="price_desc">Сначала дороже</option></select><label><input type="checkbox" name="stock" value="1"> В наличии</label><button>Применить</button></form><div id="catalog-grid"></div>`;
    }
    if(page==='product'){
      const id=Number(hash.split('/')[1]);
      const p=await api('/products/'+id);
      if(req!==requestNumber)return;
      html=`<div class="detail"><div>${image(p.images[0],p.name,'detail-image')}<div class="gallery">${p.images.map(src=>`<button data-action="gallery" data-src="${esc(src)}" aria-label="Посмотреть фото">${
        image(src,p.name)
      }
      </button>`).join('')}</div></div><div><h1>${esc(p.name)}</h1><h3>Описание</h3><p>${esc(p.description)}</p><h3>Характеристики</h3><ul>${Object.entries(p.specs).map(([k,v])=>`<li>${
        esc(k)
      }
      : ${
        esc(v)
      }
      </li>`).join('')}</ul><div class="detail-prices"><p class="price">${money(p.price)} <small>розничная цена</small></p><p class="wholesale-price">${money(p.wholesale_price)} <small>оптовая цена от ${p.wholesale_min} шт.</small></p></div><p class="muted">${p.stock?'В наличии: '+p.stock+' шт.':'Нет в наличии'}</p><div class="quantity"><button data-action="detail-minus" aria-label="Уменьшить количество">−</button><span id="detail-quantity">1</span><button data-action="detail-plus" data-max="${p.stock}" aria-label="Увеличить количество">+</button></div><p></p><div class="buy-buttons detail-buy"><button class="primary" data-action="add" data-purchase="retail" data-id="${p.id}" data-detail="1" ${p.stock?'':'disabled'}>Купить в розницу</button><button data-action="add" data-purchase="wholesale" data-min="${p.wholesale_min}" data-id="${p.id}" data-detail="1" ${p.stock>=p.wholesale_min?'':'disabled'}>Купить оптом</button></div><p></p><button data-action="favorite" data-id="${p.id}">${favorites.some(f=>f.id===p.id)?'Удалить из избранного':'Добавить в избранное'}</button></div></div>`;
    }
    if(page==='favorites')html=user?`<h1>Избранное (${favorites.length})</h1>${favorites.length?favorites.map(p=>`<div class="cart-item">${
      image(p.images[0],p.name)
    }
    <div><a href="#product/${p.id}"><h3>${
      esc(p.name)
    }
    </h3></a><strong>${
      money(p.price)
    }
    </strong><button data-action="add" data-id="${p.id}" ${
      p.stock?'':'disabled'
    }
    >В корзину</button></div><button class="remove danger" data-action="favorite" data-id="${p.id}">Удалить</button></div>`).join(''):'<p class="empty">Сохраните понравившиеся игрушки из каталога</p>'}`:authHTML('login');
    if(page==='cart')html=user?`<h1>Корзина (${cart.length})</h1>${cart.length?`<div class="cart-layout"><div>${
      cart.map(p=>`<div class="cart-item">${image(p.images[0],p.name)}<div><a href="#product/${p.id}"><h3>${esc(p.name)}</h3></a><span class="purchase-label">${p.purchase_type==='wholesale'?'Оптовая покупка':'Розничная покупка'}</span><strong>${money(p.unit_price)}</strong><div class="quantity"><button data-action="cart-quantity" data-id="${p.id}" data-type="${p.purchase_type}" data-min="${p.wholesale_min}" data-n="${p.quantity-1}" aria-label="Уменьшить">−</button><span>${p.quantity}</span><button data-action="cart-quantity" data-id="${p.id}" data-type="${p.purchase_type}" data-min="${p.wholesale_min}" data-n="${p.quantity+1}" aria-label="Увеличить">+</button></div></div><button class="remove" data-action="cart-remove" data-id="${p.id}">Удалить</button></div>`).join('')
    }
    </div><section class="summary stack"><span>Сумма</span><strong>${
      money(cart.reduce((s,p)=>s+p.unit_price*p.quantity,0))
    }
    </strong><small>Доставка включена. Оплата при получении.</small><button class="primary" data-action="checkout">Оформить заказ</button></section></div>`:'<div class="empty">Корзина пуста. <a href="#catalog">Выбрать игрушки</a></div>'}`:authHTML('login');
    if(['login','register'].includes(page))html=authHTML(page);
    if(page==='terms')html=`<section class="panel legal"><h1>Условия демонстрационного магазина</h1><p>Safiya-Toys — учебный проект. Заказы в этой версии демонстрационные; онлайн-оплата не производится. Для проверки используйте тестовые, а не реальные персональные данные.</p><p>При регистрации имя, телефон и email сохраняются в локальной базе магазина. Пароль хранится в виде криптографического хеша. Контакты и адрес заказа доступны сотруднику и назначенному курьеру, а также курьерам при разрешении свободного принятия заказа продавцом.</p><p>Для реального запуска владелец должен добавить сведения о продавце, доставке, возврате и актуальные условия обработки данных.</p><a href="#register">Вернуться к регистрации</a></section>`;
    if(['profile','settings'].includes(page)){
      if(!user)html=authHTML('login');
      else{
        orders=await api('/orders');
        if(req!==requestNumber)return;
        html=`<section class="profile"><h1>${page==='settings'?'Настройки':'Профиль'}</h1><form id="profile-form" class="form panel"><label>Имя<input name="name" value="${esc(user.name)}" required maxlength="100"></label><label>Телефон<input name="phone" value="${esc(user.phone)}" required></label><p>Email: ${esc(user.email)}</p><p>Кабинет: ${user.role==='customer'?'покупатель':user.role==='seller'?'продавец':'курьер'}</p><button class="primary">Сохранить</button><button type="button" data-action="logout">Выйти</button><p class="form-error"></p></form></section>${user.role==='customer'?`<h2 class="history-title">История заказов</h2>${
          orders.length?orders.map(o=>orderHTML(o)).join(''):'<p class="empty">Вы ещё не оформили ни одного заказа</p>'
        }
        `:''}`;
      }
    }
    if(['dashboard','stats'].includes(page)){
      const stats=await api('/stats');
      if(req!==requestNumber)return;
      html=`<h1>${page==='dashboard'?'Панель управления':'Статистика продаж'}</h1><p class="muted">Управляйте товарами, заказами и клиентами — легко и удобно.</p><div class="stats">${[['Товаров',stats.products],['Заказов',stats.orders],['Клиентов',stats.clients],['Выручка',money(stats.revenue)]].map(([t,n])=>`<div class="stat"><span>${
        t
      }
      </span><strong>${
        n
      }
      </strong></div>`).join('')}</div><section class="panel"><h2>Продажи по дням</h2><p class="muted">Только завершённые заказы. Дни в статистике — по времени Туркестана (UTC+5).</p>${stats.days.length?stats.days.map(d=>`<div class="chart-row"><span>${
        d.day
      }
      </span><meter min="0" max="${Math.max(...stats.days.map(x=>x.total))}" value="${d.total}"></meter><b>${
        money(d.total)
      }
      </b></div>`).join(''):'<p class="empty">Пока нет завершённых заказов</p>'}</section>${page==='dashboard'?'<p></p><a href="#products">Управлять товарами</a> · <a href="#orders">Открыть заказы</a>':''}`;
    }
    if(page==='products'){
      products=await api('/products');
      if(req!==requestNumber)return;
      html=`<div class="section-head"><h1>Товары</h1><button class="primary" data-action="edit-product">Добавить товар</button></div><div class="seller-filters"><input id="seller-search" type="search" placeholder="Поиск товара…" aria-label="Поиск товара"><select id="seller-category"><option value="">Все категории</option>${categories.map(c=>`<option value="${esc(c.name)}">${esc(c.name)}</option>`).join('')}</select></div><p></p><div class="table-wrap"><table><thead><tr><th>Фото</th><th>Название</th><th>Категория</th><th>Розница</th><th>Опт</th><th>Минимум</th><th>Остаток</th><th>Действия</th></tr></thead><tbody>${products.map(p=>`<tr data-product-name="${esc(p.name.toLowerCase())}" data-product-category="${esc(p.category)}"><td>${
        image(p.images[0],p.name)
      }
      </td><td>${
        esc(p.name)
      }
      </td><td>${
        esc(p.category)
      }
      </td><td>${
        money(p.price)
      }
      </td><td>${
        money(p.wholesale_price)
      }
      </td><td>${
        p.wholesale_min+' шт.'
      }
      </td><td>${
        p.stock
      }
      </td><td><div class="row"><button data-action="edit-product" data-id="${p.id}">Изменить</button><button class="danger" data-action="delete-product" data-id="${p.id}">Удалить</button></div></td></tr>`).join('')}</tbody></table></div>${!products.length?'<p class="empty">Добавьте первый товар</p>':''}`;
    }
    if(page==='orders'){
      [orders,users]=await Promise.all([api('/orders'),api('/users')]);
      if(req!==requestNumber)return;
      html=`<h1>Заказы (${orders.length})</h1>${orders.length?`<div class="table-wrap"><table><thead><tr><th>№</th><th>Клиент</th><th>Контакты</th><th>Сумма</th><th>Статус</th><th>Управление</th></tr></thead><tbody>${
        orders.map(o=>`<tr><td>#${String(o.id).padStart(4,'0')}</td><td>${esc(o.client.name)}</td><td>${esc(o.client.phone)}</td><td>${money(o.total)}</td><td>${statusBadge(o)}</td><td><details class="manage-order"><summary>Открыть заказ</summary>${orderHTML(o,true)}</details></td></tr>`).join('')
      }
      </tbody></table></div>`:'<p class="empty">Новых заказов пока нет</p>'}`;
    }
    if(page==='clients'){
      users=await api('/users');
      if(req!==requestNumber)return;
      html=`<h1>Клиенты</h1><div class="table-wrap"><table><thead><tr><th>Имя</th><th>Контакты</th><th>Заказы</th></tr></thead><tbody>${users.filter(u=>u.role==='customer').map(u=>`<tr><td>${
        esc(u.name)
      }
      </td><td>${
        esc(u.phone)
      }
      <br>${
        esc(u.email)
      }
      </td><td><details><summary>${
        u.orders.length
      }
      заказов</summary>${
        u.orders.map(o=>`<p>№${o.id} · ${money(o.total)} · ${esc(o.status)}</p>`).join('')||'Заказов нет'
      }
      </details></td></tr>`).join('')}</tbody></table></div>`;
    }
    if(['available','deliveries','history'].includes(page)){
      orders=await api('/deliveries');
      if(req!==requestNumber)return;
      const visible=orders.filter(o=>page==='available'?!o.courier_id:page==='history'?o.courier_id===user.id&&['Завершен','Отменен'].includes(o.status):o.courier_id===user.id&&!['Завершен','Отменен'].includes(o.status));
      const today=new Date().toLocaleDateString('en-CA',{
        timeZone:'Asia/Almaty'
      });
      const total=orders.filter(o=>o.status==='Завершен'&&o.delivered&&new Date(o.delivered).toLocaleDateString('en-CA',{
        timeZone:'Asia/Almaty'
      })===today).reduce((s,o)=>s+o.total,0);
      html=`<h1>${page==='available'?'Доступные заказы':page==='history'?'История доставок':'Мои доставки'}</h1><nav class="tabs">${courierNav.slice(0,3).map(([k,t])=>`<a href="#${k}" class="${page===k?'active':''}">${
        t
      }
      </a>`).join('')}</nav><p class="muted">Доставлено сегодня: ${money(total)}</p><div class="deliveries">${visible.length?visible.map(o=>deliveryHTML(o)).join(''):'<p class="empty">Здесь пока нет доставок</p>'}</div>`;
    }
    if(req!==requestNumber)return;
    main.innerHTML=html;
    if(page==='catalog')await filterCatalog();
  }
  catch(e){
    if(req!==requestNumber)return;
    main.innerHTML=`<div class="empty"><p>${esc(e.message)}</p><button data-action="retry">Повторить</button></div>`;
  }
}

// Создаёт форму входа или регистрации.
function authHTML(type){
  const reg=type==='register';
  return `<section class="auth">${logo()}<nav class="tabs"><a href="#login" class="${!reg?'active':''}">Вход</a><a href="#register" class="${reg?'active':''}">Регистрация</a></nav><form id="auth-form" data-type="${reg?'register':'login'}" class="form">${reg?'<label>Имя<input name="name" autocomplete="name" placeholder="Имя" required maxlength="100"></label><label>Номер телефона<input name="phone" type="tel" autocomplete="tel" placeholder="+7 700 123 45 67" required></label>':''}<label>Email<input name="email" type="email" autocomplete="email" placeholder="Email" required></label><label>Пароль<input name="password" type="password" autocomplete="${reg?'new-password':'current-password'}" placeholder="Пароль" minlength="8" required></label>${reg?'<label class="check"><input name="consent" type="checkbox" required> <span>Я соглашаюсь с <a href="#terms">условиями использования</a></span></label>':''}<button class="primary">${reg?'Зарегистрироваться':'Войти'}</button><p class="form-error" role="alert"></p></form><small>${reg?'Уже есть аккаунт? <a href="#login">Войти</a>':'Нет аккаунта? <a href="#register">Регистрация</a>'}</small><div class="auth-welcome">${image('/assets/products/teddy.png','Медведь')}<p>Добро пожаловать<br>в мир игрушек!</p></div></section>`;
}

// Создаёт цветную надпись со статусом заказа.
const statusBadge=o=>`<span class="badge ${o.status==='Завершен'?'done':''}">${esc(o.status)}</span>`;

// Создаёт карточку заказа.
// Для продавца дополнительно показывает управление статусом и курьером.
function orderHTML(o,seller=false){
  const closed=['Завершен','Отменен'].includes(o.status);
  return `<article class="order"><div class="section-head"><h3>Заказ №${o.id}</h3>${statusBadge(o)}</div><p>${date(o.created)} · <b>${money(o.total)}</b></p><p>${esc(o.client.name)} · ${esc(o.client.phone)}</p><p>${esc(o.client.address)}</p><p>${esc(o.client.payment)}</p>${o.client.comment?`<p>Комментарий: ${
    esc(o.client.comment)
  }
  </p>`:''}<details><summary>Состав заказа (${o.items.length})</summary><div class="order-items">${o.items.map(p=>`<p>${
    esc(p.name)
  }
  × ${
    p.quantity
  }
  — ${
    money(p.price*p.quantity)
  }
  </p>`).join('')}</div></details>${seller&&!closed?`<form class="order-form row wrap" data-id="${o.id}"><select name="status" aria-label="Статус заказа">${
    ['Новый','В обработке','Передан курьеру','Доставляется','Завершен','Отменен'].map(s=>`<option ${s===o.status?'selected':''}>${s}</option>`).join('')
  }
  </select><button>Сохранить статус</button></form><p></p><form class="assign-form row wrap" data-id="${o.id}"><select name="courier_id" aria-label="Курьер"><option value="">Выберите свободного курьера</option>${
    users.filter(u=>u.role==='courier'&&(!u.busy||u.id===o.courier_id)).map(u=>`<option value="${u.id}" ${u.id===o.courier_id?'selected':''}>${esc(u.name)}</option>`).join('')
  }
  </select><button>Назначить</button></form><p></p>${
    o.status==='В обработке'&&!o.courier_id?`<button data-action="available" data-id="${o.id}" data-value="${o.available?0:1}">${o.available?'Закрыть свободное принятие':'Разрешить курьерам принять заказ'}</button>`:''
  }
  `:''}${o.courier_id?`<small>Назначен курьер${
    seller?': '+esc(users.find(u=>u.id===o.courier_id)?.name||o.courier_id):''
  }
  </small>`:''}</article>`;
}

// Создаёт карточку доставки для кабинета курьера.
function deliveryHTML(o){
  const available=!o.courier_id;
  return `<article class="order"><div class="section-head"><h3>Заказ №${o.id}</h3>${statusBadge(o)}</div><h3>${esc(o.client.address)}</h3><p>${esc(o.client.name)}</p><p><a href="tel:${esc(o.client.phone.replace(/[^+\d]/g,''))}">Позвонить: ${esc(o.client.phone)}</a></p><p>${money(o.total)} · ${esc(o.client.payment)}</p><p>${esc(o.client.comment||'Без комментария')}</p><a href="https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(o.client.address+', Туркестан')}" target="_blank" rel="noopener noreferrer">Открыть адрес на карте</a><footer class="row wrap">${available?`<button class="primary" data-action="delivery" data-id="${o.id}" data-step="accept">Принять заказ</button>`:o.status==='Передан курьеру'?`<button class="primary" data-action="delivery" data-id="${o.id}" data-step="travel">В пути</button>`:o.status==='Доставляется'?`<button class="primary" data-action="delivery" data-id="${o.id}" data-step="done">Доставлен</button>`:''}${!available&&['Передан курьеру','Доставляется'].includes(o.status)?`<button data-action="delivery" data-id="${o.id}" data-step="failed">Не удалось доставить</button>`:''}</footer></article>`;
}

// Собирает значения фильтров и загружает подходящие товары.
async function filterCatalog(){
  const f=$('#filters');
  if(!f)return;
  const query=new URLSearchParams(new FormData(f));
  query.set('q',$('#search-form input').value);
  $('#catalog-grid').innerHTML='<p class="empty">Загрузка…</p>';
  try{
    const rows=await api('/products?'+query);
    if($('#catalog-grid'))$('#catalog-grid').innerHTML=grid(rows);
  }
  catch(e){
    if($('#catalog-grid'))$('#catalog-grid').innerHTML=`<p class="empty">${esc(e.message)}</p>`;
  }
}

// Проверяет, что пользователь вошёл именно как покупатель.
function requireCustomer(){
  if(!user){
    go('login');
    toast('Войдите, чтобы продолжить');
    return false;
  }
  if(user.role!=='customer'){
    toast('Эта функция доступна покупателю');
    return false;
  }
  return true;
}

// Файлы новых фотографий и уже сохранённые изображения товара.
let selectedFiles=[],keptImages=[];

// Показывает предварительный просмотр выбранных фотографий.
function uploadPreview(){
  const el=$('#upload-preview');
  if(!el)return;
  el.innerHTML=keptImages.map((src,i)=>`<figure>${image(src,'Фото товара')}<button type="button" data-action="remove-kept" data-index="${i}">Удалить фото</button></figure>`).join('')+selectedFiles.map((f,i)=>`<figure>${image(f.url,f.file.name)}<button type="button" data-action="remove-file" data-index="${i}">Удалить фото</button></figure>`).join('');
}

// Открывает форму добавления или редактирования товара.
function productForm(id){
  const p=products.find(p=>p.id===id);
  selectedFiles.forEach(f=>URL.revokeObjectURL(f.url));
  selectedFiles=[];
  keptImages=p?[...p.images]:[];
  showDialog(`<h2>${p?'Редактировать товар':'Добавить товар'}</h2><form id="product-form" data-id="${p?.id||''}" class="form"><div class="uploads"><b>Фотографии товара</b><small> PNG, JPEG, WebP · до 5 МБ · максимум 8 фото</small><label class="upload-input">Выбрать из галереи<input type="file" id="gallery-input" accept="image/png,image/jpeg,image/webp" multiple></label><label class="upload-input">Сделать фото<input type="file" id="camera-input" accept="image/*" capture="environment"></label><div class="upload-preview" id="upload-preview"></div></div><label>Название<input name="name" required maxlength="150" value="${esc(p?.name||'')}"></label><div class="row"><label>Розничная цена, ₸<input name="price" type="number" min="1" step="1" required value="${p?.price||''}"></label><label>Оптовая цена, ₸<input name="wholesale_price" type="number" min="1" step="1" required value="${p?.wholesale_price||''}"></label></div><div class="row"><label>Минимум для опта, шт.<input name="wholesale_min" type="number" min="2" step="1" required value="${p?.wholesale_min||5}"></label><label>Остаток<input name="stock" type="number" min="0" step="1" required value="${p?.stock??''}"></label></div><label>Категория<select name="category_id" required>${categories.map(c=>`<option value="${c.id}" ${
    c.id===p?.category_id?'selected':''
  }>${
    esc(c.name)
  }</option>`).join('')}</select></label><label>Описание<textarea name="description" required rows="4">${esc(p?.description||'')}</textarea></label><label>Характеристики — каждая с новой строки, «Название: значение»<textarea name="specs_text" rows="3">${esc(Object.entries(p?.specs||{'Возраст':'3+'}).map(([k,v])=>k+': '+v).join('\n'))}</textarea></label><button class="primary">Сохранить</button><p class="form-error" role="alert"></p></form>`);
  uploadPreview();
}

// Один общий обработчик всех кнопок с атрибутом data-action.
// По значению data-action определяется, какое действие нужно выполнить.
document.addEventListener('click',async e=>{
  const b=e.target.closest('[data-action]');if(!b)return;const action=b.dataset.action,id=Number(b.dataset.id);try{
    if(action==='menu'){
      if(user&&user.role!=='customer')document.body.classList.toggle('menu-open');else showDialog(`<h2>Меню</h2><div class="stack">${customerNav.map(([k,t])=>`<a href="#${k}">${
        t
      }</a>`).join('')}<a href="#login">Вход для сотрудников</a></div>`);return;
    }if(action==='close'){
      modal.close();return;
    }if(action==='retry'){
      await render();return;
    }if(action==='logout'){
      await api('/auth/logout',{
        method:'POST'
      });user=null;events?.close();history.replaceState(null,'','/#home');await render();return;
    }if(action==='category'){
      go('catalog'+(id?'/'+id:''));return;
    }if(action==='gallery'){
      $('.detail-image').src=b.dataset.src;return;
    }if(action==='detail-minus'||action==='detail-plus'){
      const el=$('#detail-quantity');el.textContent=String(Math.max(1,Math.min(Number(b.dataset.max)||Infinity,Number(el.textContent)+(action==='detail-plus'?1:-1))));return;
    }if(action==='edit-product'){
      productForm(id);return;
    }if(action==='remove-kept'){
      keptImages.splice(Number(b.dataset.index),1);uploadPreview();return;
    }if(action==='remove-file'){
      const [f]=selectedFiles.splice(Number(b.dataset.index),1);URL.revokeObjectURL(f.url);uploadPreview();return;
    } b.disabled=true; if(action==='favorite'){
      if(!requireCustomer())return;await api('/favorites/'+id,{
        method:favorites.some(p=>p.id===id)?'DELETE':'PUT'
      });await render(false);toast('Избранное обновлено');
    } if(action==='add'){
      if(!requireCustomer())return;const purchaseType=b.dataset.purchase||'retail';const product=products.find(p=>p.id===id);let n=b.dataset.detail?Number($('#detail-quantity').textContent):1;if(purchaseType==='wholesale')n=Math.max(n,Number(b.dataset.min)||product?.wholesale_min||2);await api('/cart/'+id,{
        method:'PUT',body:{
          quantity:(cart.find(p=>p.id===id)?.purchase_type===purchaseType?cart.find(p=>p.id===id).quantity:0)+n,
          purchase_type:purchaseType
        }
      });await refreshUserData();shell();toast(purchaseType==='wholesale'?'Товар добавлен оптом':'Товар добавлен в розницу');
    } if(action==='cart-quantity'){
      const n=Number(b.dataset.n);const minimum=b.dataset.type==='wholesale'?Number(b.dataset.min):1;if(n>0&&n<minimum){toast('Для опта нужно минимум '+minimum+' шт.');return;}await api('/cart/'+id,{
        method:n>0?'PUT':'DELETE',...(n>0?{
          body:{
            quantity:n,
            purchase_type:b.dataset.type||'retail'
          }
        }:{
        })
      });await render(false);
    } if(action==='cart-remove'){
      await api('/cart/'+id,{
        method:'DELETE'
      });await render(false);
    } if(action==='checkout')showDialog(`<h2>Оформление заказа</h2><p>К оплате: <b>${money(cart.reduce((s,p)=>s+p.unit_price*p.quantity,0))}</b></p><form id="checkout-form" class="form"><label>Имя<input name="name" required value="${esc(user.name)}"></label><label>Телефон<input name="phone" type="tel" required value="${esc(user.phone)}"></label><label>Адрес доставки<input name="address" required placeholder="Туркестан, улица, дом, квартира"></label><label>Комментарий<textarea name="comment" rows="2"></textarea></label><label>Способ оплаты<select name="payment"><option>Наличными</option><option>Картой при получении</option></select></label><small>Это демонстрационный заказ, списания денег не будет.</small><button class="primary">Подтвердить заказ</button><p class="form-error"></p></form>`); if(action==='delete-product'){
      showDialog(`<h2>Удалить товар?</h2><p>Товар исчезнет из каталога. История заказов сохранится.</p><button class="primary" data-action="confirm-delete" data-id="${id}">Удалить</button>`);
    } if(action==='confirm-delete'){
      await api('/products/'+id,{
        method:'DELETE'
      });modal.close();await render();toast('Товар удалён');
    } if(action==='available'){
      await api('/orders/'+id,{
        method:'PATCH',body:{
          available:b.dataset.value==='1'
        }
      });await render(false);
    } if(action==='delivery'){
      if(b.dataset.step==='failed'){
        showDialog(`<h2>Вернуть заказ продавцу?</h2><p>Заказ вернётся в обработку. Продавец сможет назначить доставку повторно.</p><button class="primary" data-action="confirm-failed" data-id="${id}">Подтвердить</button>`);
      }else{
        await api('/deliveries/'+id,{
          method:'PATCH',body:{
            action:b.dataset.step
          }
        });await render(false);toast('Статус доставки обновлён');
      }
    } if(action==='confirm-failed'){
      await api('/deliveries/'+id,{
        method:'PATCH',body:{
          action:'failed'
        }
      });modal.close();await render(false);
    }
  }catch(e){
    toast(e.message);
  }finally{
    b.disabled=false;
  }
});

// Обрабатывает отправку всех форм на сайте:
// вход, регистрацию, профиль, фильтры, заказ и товары.
document.addEventListener('submit',async e=>{
  const f=e.target;if(!(f instanceof HTMLFormElement))return;e.preventDefault();const b=f.querySelector('button[type=submit],button:not([type])');if(b)b.disabled=true;const data=Object.fromEntries(new FormData(f)),error=f.querySelector('.form-error');if(error)error.textContent='';try{
    if(f.id==='auth-form'){
      const r=await api('/auth/'+f.dataset.type,{
        method:'POST',body:{
          ...data,consent:!!data.consent
        }
      });user=r.user;connect();history.replaceState(null,'',user.role==='seller'?'/seller#dashboard':user.role==='courier'?'/courier#deliveries':'/#home');await render();
    } if(f.id==='profile-form'){
      user=(await api('/users/me',{
        method:'PATCH',body:data
      })).user;shell();toast('Профиль сохранён');
    } if(f.id==='search-form'){
      if(page==='catalog')await filterCatalog();else go('catalog?q='+encodeURIComponent(data.q));
    } if(f.id==='filters')await filterCatalog(); if(f.id==='checkout-form'){
      const r=await api('/orders',{
        method:'POST',body:data
      });modal.close();toast('Заказ №'+r.id+' оформлен');go('profile');
    } if(f.classList.contains('order-form')){
      await api('/orders/'+f.dataset.id,{
        method:'PATCH',body:data
      });await render(false);toast('Статус сохранён');
    } if(f.classList.contains('assign-form')){
      if(!data.courier_id)throw new Error('Выберите курьера');await api('/orders/'+f.dataset.id,{
        method:'PATCH',body:{
          courier_id:Number(data.courier_id)
        }
      });await render(false);toast('Курьер назначен');
    } if(f.id==='product-form'){
      const fd=new FormData(f);fd.delete('specs_text');const specs={
      };for(const line of data.specs_text.split('\n').filter(x=>x.trim())){
        const split=line.indexOf(':');if(split<1)throw new Error('Характеристика должна быть в формате «Название: значение»');specs[line.slice(0,split).trim()]=line.slice(split+1).trim();
      }fd.set('specs',JSON.stringify(specs));fd.set('kept',JSON.stringify(keptImages));selectedFiles.forEach(f=>fd.append('photos',f.file));await api('/products'+(f.dataset.id?'/'+f.dataset.id:''),{
        method:f.dataset.id?'PUT':'POST',body:fd
      });modal.close();await render();toast('Товар сохранён');
    }
  }catch(err){
    if(error)error.textContent=err.message;else toast(err.message);
  }finally{
    if(b)b.disabled=false;
  }
});

// Проверяет выбранные фотографии: формат, размер и количество.
document.addEventListener('change',e=>{
  if(['gallery-input','camera-input'].includes(e.target.id)){
    for(const file of e.target.files){
      if(!['image/png','image/jpeg','image/webp'].includes(file.type)){
        toast('Поддерживаются PNG, JPEG и WebP');continue;
      }if(file.size>5*1024*1024){
        toast('Фото больше 5 МБ');continue;
      }if(keptImages.length+selectedFiles.length>=8){
        toast('Можно добавить максимум 8 фото');break;
      }selectedFiles.push({
        file,url:URL.createObjectURL(file)
      });
    }e.target.value='';uploadPreview();
  }
});

// Выполняет поиск товара в кабинете продавца во время ввода текста.
document.addEventListener('input',e=>{
  if(['seller-search','seller-category'].includes(e.target.id)){
    const search=$('#seller-search')?.value.toLowerCase()||'';
    const category=$('#seller-category')?.value||'';
    document.querySelectorAll('[data-product-name]').forEach(row=>{
      row.hidden=!row.dataset.productName.includes(search)||(category&&row.dataset.productCategory!==category);
    });
  }
});

document.addEventListener('change',e=>{
  if(e.target.id==='seller-category')e.target.dispatchEvent(new Event('input',{bubbles:true}));
});

// При изменении адреса закрывает окно, обновляет страницу
// и прокручивает сайт в самое начало.
window.addEventListener('hashchange',()=>{
  modal.close();render();window.scrollTo(0,0);
});
try{
  const [auth,cats]=await Promise.all([api('/auth/me'),api('/categories')]);
  user=auth.user;
  categories=cats;
  connect();
  await render();
}
catch(e){
  main.innerHTML=`<p class="empty">${esc(e.message)}. Обновите страницу.</p>`;
}
