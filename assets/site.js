/* Поведение страницы: открыто ли сейчас, шары на прокрутке, появление блоков, отзывы, форма, панель на телефоне. */
(function () {
  var TEL = '<a href="tel:+79963940270">+7 (996) 394-02-70</a> или напишите в <a href="https://wa.me/79963940207" target="_blank" rel="noopener">WhatsApp</a>';
  var FORM_ENDPOINT = ''; /* {{адрес приёма заявок}} */
  var reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  function $(id) { return document.getElementById(id); }
  var hero = $('hero'), bar = $('bar'), contacts = $('contacts');

  /* Время в Омске (UTC+6), магазин открыт каждый день 9:00–20:00 */
  var now = $('now'), h = new Date(Date.now() + 6 * 3600000).getUTCHours(), open = h >= 9 && h < 20;
  now.textContent = open ? 'Сейчас открыто, до 20:00' : (h < 9 ? 'Сегодня откроемся в 9:00' : 'Завтра откроемся в 9:00');
  now.classList.toggle('on', open);
  now.hidden = false;

  function update() {
    var H = innerHeight, hr = hero.getBoundingClientRect(), cr = contacts.getBoundingClientRect();
    if (window.SF) { SF.live(hr.bottom > 0); SF.scroll(-hr.top / Math.max(1, hr.height)); }
    bar.classList.toggle('on', hr.bottom < H * .3 && cr.top > H * .6);
  }
  var ticking = false;
  addEventListener('scroll', function () { if (!ticking) { ticking = true; requestAnimationFrame(function () { ticking = false; update(); }); } }, { passive: true });
  addEventListener('resize', update);
  update();

  if (!reduce && 'IntersectionObserver' in window) {
    var rise = document.querySelectorAll('.sec h2,.sec .sub,.tile,.big-q,.side-q,.strip figure,.qs blockquote,.wed,.chips li,.pull,.rev-g:not(.rev-more) .rev,.maplink,.form');
    rise.forEach(function (el) { el.classList.add('rise'); });
    var seen = new IntersectionObserver(function (es) {
      es.forEach(function (e) { if (e.isIntersecting) { e.target.classList.add('in'); seen.unobserve(e.target); } });
    }, { rootMargin: '0px 0px -8% 0px' });
    rise.forEach(function (el) { seen.observe(el); });
  }

  var more = $('revMore'), btn = $('revBtn');
  btn.addEventListener('click', function () {
    var o = more.classList.toggle('open');
    btn.setAttribute('aria-expanded', o);
    btn.textContent = o ? 'Свернуть отзывы' : 'Показать ещё отзывы';
  });

  var form = $('form'), msg = $('formMsg');
  form.addEventListener('submit', function (e) {
    e.preventDefault();
    var ph = form.elements.phone, ok = ph.value.replace(/\D/g, '').length >= 10;
    ph.classList.toggle('invalid', !ok);
    if (!ok) { msg.textContent = 'Укажите телефон, чтобы мы могли связаться.'; ph.focus(); return; }
    if (!FORM_ENDPOINT) { msg.innerHTML = 'Заявки с сайта пока не подключены, поэтому ваш номер не отправлен. Позвоните: ' + TEL; return; }
    fetch(FORM_ENDPOINT, { method: 'POST', body: new FormData(form) })
      .then(function (r) { if (!r.ok) throw 0; msg.textContent = 'Заявка принята, свяжемся с вами.'; form.reset(); })
      .catch(function () { msg.innerHTML = 'Заявка не отправилась. Позвоните: ' + TEL; });
  });
})();
