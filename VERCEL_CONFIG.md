# Instrucciones para configurar Vercel correctamente

Si la app sigue mostrando "500 FUNCTION_INVOCATION_FAILED" en `https://ligrowtasks.vercel.app/`,
necesitas cambiar la configuración del proyecto en el **dashboard de Vercel**:

## Pasos en el Vercel Dashboard

1. Ve a https://vercel.com/dashboard
2. Selecciona el proyecto `ligrowtasks`
3. Ve a **Settings → General**
4. En la sección **"Build & Development Settings"**:
   - **Framework Preset**: `Other`
   - **Build Command**: `node scripts/bundle-static.js`
   - **Output Directory**: `public`
   - **Install Command**: `npm install`
   - **Development Command**: (dejar vacío)
5. Haz click en **Save**
6. Ve a **Deployments** y haz click en **Redeploy** (o pushea cualquier cambio)

## Verificar que funciona

- `https://ligrowtasks.vercel.app/` → debe cargar el dashboard de Ligrow Tasks
- `https://ligrowtasks.vercel.app/index.html` → mismo resultado

## Por qué pasa esto

Vercel detecta `package.json` y asume que es una app Node.js. Aunque `vercel.json` indica
que es un sitio estático, la configuración guardada en el dashboard de Vercel puede sobreescribir
el `vercel.json`.
