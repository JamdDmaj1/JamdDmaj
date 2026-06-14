<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
  <meta name="color-scheme" content="dark">
  <title>Volviendo a JamdDmaj AI</title>
  <style>
    * {
      box-sizing: border-box;
    }

    body {
      display: grid;
      min-height: 100dvh;
      margin: 0;
      padding: 24px;
      place-items: center;
      background: #090b10;
      color: #f5f7fb;
      font-family: Inter, system-ui, sans-serif;
      text-align: center;
    }

    main {
      width: min(420px, 100%);
      padding: 32px 24px;
      border: 1px solid rgba(255, 255, 255, 0.1);
      border-radius: 24px;
      background: #12151e;
    }

    h1 {
      margin: 0 0 10px;
      font-size: 1.45rem;
    }

    p {
      margin: 0 0 22px;
      color: #a6adbd;
      line-height: 1.55;
    }

    button {
      width: 100%;
      min-height: 48px;
      border: 0;
      border-radius: 14px;
      background: linear-gradient(135deg, #8b5cf6, #22d3ee);
      color: white;
      font: inherit;
      font-weight: 750;
      cursor: pointer;
    }
  </style>
</head>
<body>
  <main>
    <h1>Autorización completada</h1>
    <p id="message">Volviendo a JamdDmaj AI...</p>
    <button id="openAppBtn" type="button">Abrir JamdDmaj AI</button>
  </main>

  <script>
    (() => {
      const code = new URLSearchParams(location.search).get("code");
      const button = document.getElementById("openAppBtn");
      const message = document.getElementById("message");

      if (!code) {
        message.textContent = "OpenRouter no devolvió un código de autorización. Inténtalo de nuevo.";
        button.hidden = true;
        return;
      }

      const appUrl = `jamddmaj://oauth?code=${encodeURIComponent(code)}`;
      const openApp = () => {
        location.href = appUrl;
      };

      button.addEventListener("click", openApp);
      setTimeout(openApp, 150);
    })();
  </script>
</body>
</html>
