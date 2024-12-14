import Head from "next/head";
import Image from "next/image";
import { Geist, Geist_Mono } from "next/font/google";
import styles from "@/styles/Home.module.css";


export default function Home() {
  return (
    <>
      <Head>
        <title>Aidble</title>
        <meta name="description" content="Listen to any PDF like an audio book" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <link rel="icon" href="/favicon.ico" />
      </Head>
      <div>
        <p>Hello World</p>
      </div>
    </>
  );
}
