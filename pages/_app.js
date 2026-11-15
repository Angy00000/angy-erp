import '../styles/globals.css';
import Head from 'next/head';
import { Toasts } from '../components/ui';

export default function App({ Component, pageProps }) {
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
