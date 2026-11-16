import '../styles/globals.css';
import Head from 'next/head';
import { useEffect } from 'react';
import { Toasts } from '../components/ui';

export default function App({ Component, pageProps }) {
  useEffect(() => {
    if ('serviceWorker' in navigator && location.hostname !== 'localhost') navigator.serviceWorker.register('/sw.js').catch(() => {});
  }, []);
  return (
    <>
      <Head>
        <title>ANGY ERP — Gestion de production</title>
        <meta name="viewport" content="width=device-width, initial-scale=1" />
      </Head>
      <Component {...pageProps} />
      <Toasts />
    </>
  );
}
