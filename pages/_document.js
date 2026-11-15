import { Html, Head, Main, NextScript } from 'next/document';

export default function Document() {
  return (
    <Html lang="fr">
      <Head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link href="https://fonts.googleapis.com/css2?family=Manrope:wght@400;500;600;700;800&family=JetBrains+Mono:wght@500;700&display=swap" rel="stylesheet" />
        <meta name="theme-color" content="#0f3d2e" />
        <link rel="icon" href="data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'><rect width='32' height='32' rx='8' fill='%23d98e2b'/><text x='16' y='22' font-size='17' font-family='Arial' font-weight='900' text-anchor='middle' fill='%230f3d2e'>A</text></svg>" />
      </Head>
      <body><Main /><NextScript /></body>
    </Html>
  );
}
