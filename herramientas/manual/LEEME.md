# Página local de prueba y capturas

La app corre en el navegador con un servidor simulado (`falso.js`, datos 100 % inventados), sin Google ni Sheet.

```bash
python3 herramientas/manual/armar.py        # arma prueba_ui/index.html con el código de src/
python3 -m http.server 8765 --bind 127.0.0.1 --directory prueba_ui
# abrir http://127.0.0.1:8765/index.html?rol=admin&vista=resumen   (rol: admin | dig | consulta)
node herramientas/manual/capturar.js herramientas/manual/tomas.js capturas   # capturas con Chrome sin ventana
```

`tomas.js` define cada captura (pantalla, rol y pasos que se ejecutan en la página). Al terminar, borrar `prueba_ui/`.
