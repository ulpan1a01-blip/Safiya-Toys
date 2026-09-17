// Отправляет запрос на сервер.
// Например: api('/products') отправит запрос на /api/products.
export async function api(url, options = {}) {
  // Создаём заголовки запроса.
  const headers = {
    'X-Safiya-Request': '1',
    ...options.headers
  };

  // Если есть body и это не FormData,
  // превращаем JavaScript-объект в JSON.
  if (options.body && !(options.body instanceof FormData)) {
    headers['Content-Type'] = 'application/json';
    options.body = JSON.stringify(options.body);
  }

  // Отправляем запрос на сервер.
  const response = await fetch('/api' + url, {
    ...options,
    headers
  });

  // Получаем ответ сервера в формате JSON.
  const data = await response.json();

  // Если сервер вернул ошибку.
  if (!response.ok) {
    // Показываем ошибку сервера или стандартный текст.
    const error = new Error(
      data.error || 'Не удалось выполнить запрос'
    );

    // Сохраняем код ошибки, например 404 или 500.
    error.status = response.status;

    // Передаём ошибку в catch.
    throw error;
  }

  // Возвращаем полученные данные.
  return data;
}


// Форматирует число как цену.
// Например: money(14500) → "14 500 ₸".
export function money(number) {
  const formattedNumber = new Intl.NumberFormat('ru-RU').format(number);

  return formattedNumber + ' ₸';
}


// Защищает текст перед добавлением в HTML.
// Заменяет опасные символы безопасными HTML-кодами.
export function esc(value) {
  // Если значение пустое, используем пустую строку.
  const text = String(value ?? '');

  // Символы, которые нужно заменить.
  const symbols = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  };

  // Находим специальные символы и заменяем их.
  return text.replace(/[&<>"']/g, function (symbol) {
    return symbols[symbol];
  });
}


// Создаёт HTML-код изображения.
//
// src — адрес изображения.
// alt — описание изображения.
// className — CSS-класс изображения.
export function image(src, alt = '', className = '') {
  return `
    <img
      src="${esc(src)}"
      alt="${esc(alt)}"
      class="${esc(className)}"
      loading="lazy"
    >
  `;
}


// Форматирует дату и время.
//
// Туркестан использует казахстанское время UTC+5.
// В IANA этот часовой пояс называется Asia/Almaty и действует для Туркестана.
// Например: "14.09.2026, 12:30".
export function date(dateValue) {
  const newDate = new Date(dateValue);

  return newDate.toLocaleString('ru-RU', {
    timeZone: 'Asia/Almaty',
    dateStyle: 'short',
    timeStyle: 'short'
  });
}
