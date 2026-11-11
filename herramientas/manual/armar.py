import re, os
os.chdir(os.path.dirname(os.path.abspath(__file__)) + '/../..')
idx = open('src/ui/Index.html').read()
html = re.sub(r"<\?!= incluir_\('([^']+)'\); \?>", lambda m: open('src/' + m.group(1) + '.html').read(), idx)
html = re.sub(r"<\? if \(prueba\) \{ \?>.*?<\? \} \?>", '', html, flags=re.S)  # D111: el manual muestra la app oficial, sin franja
servidor = ''.join(open('src/' + f).read() + '\n' for f in sorted(os.listdir('src')) if f.endswith('.js') and not f.startswith('Carga'))
stub = r"""<meta name="viewport" content="width=device-width, initial-scale=1">
<script>
""" + servidor + open('herramientas/manual/falso.js').read() + r"""
(function () {
  var q = new URLSearchParams(location.search), rol = q.get('rol') || 'dig';
  var TOK = { admin: 'T-admin', dig: 'T-dig', nuevo: 'T-nuevo' }[rol];
  try { sessionStorage.clear(); localStorage.clear(); } catch (e) {}
  if (q.get('recordado')) localStorage.setItem('it_ultimo_usuario', JSON.stringify({ id: 'USR-02', nombre: 'Digitadora' }));
  if (!q.get('login')) {
    sessionStorage.setItem('it_token', TOK);
    sessionStorage.setItem('it_perfil', JSON.stringify({ nombre: rol === 'admin' ? 'Administradora' : 'Digitadora', rol: rol === 'admin' ? 'administradora' : 'digitadora' }));
    sessionStorage.setItem('it_vista', q.get('vista') || 'inicio');
    if (q.get('serv') || q.get('per')) sessionStorage.setItem('it_cierre', JSON.stringify({ periodo: q.get('per') || null, servicio: q.get('serv') || 'luz', soloEsperadas: true }));
  }
  window.confirm = function () { return true; };
  window.prompt = function (m, v) { return v || 'Motivo de ejemplo'; };
  window.google = { script: {} };
  Object.defineProperty(window.google.script, 'run', { get: function () {
    var ok, mal; var o = { withSuccessHandler: function (f) { ok = f; return o; }, withFailureHandler: function (f) { mal = f; return o; },
      llamar: function (a, t, d) { setTimeout(function () {
        if (window.SIN_CONEXION_FALSA) return mal && mal(new Error('x'));
        ok(JSON.parse(JSON.stringify(llamar(a, t, JSON.parse(JSON.stringify(d || {})))))); }, 20); } };
    return o; } });
})();
</script>"""
html = html.replace('<meta charset="utf-8">', '<meta charset="utf-8">' + stub)
os.makedirs('prueba_ui', exist_ok=True)
open('prueba_ui/index.html', 'w').write(html)
print('ok', len(html))
