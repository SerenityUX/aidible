"use client";

import Head from "next/head";
import { useState } from "react";
import dynamic from "next/dynamic";
import styles from "@/styles/Home.module.css";

// Import the PDF viewer component with no SSR
const PDFViewer = dynamic(() => import("../components/PDFViewer"), {
  ssr: false,
  loading: () => <p>Loading PDF viewer...</p>,
});

export default function Home() {
  const [pdfFile, setPdfFile] = useState(null);

  const handleFileChange = (event) => {
    const file = event.target.files[0];
    if (file) {
      setPdfFile(URL.createObjectURL(file));
    }
  };

  return (
    <>
      <Head>
        <title>Aidble</title>
        <meta name="description" content="Listen to any PDF like an audio book" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <link rel="icon" href="/favicon.ico" />
      </Head>
      <div style={{ padding: "20px" }}>
        <img style={{ width: 120 }} src="./aidble.svg" alt="Aidble logo" />
        <p>Upload PDF</p>
        <input type="file" accept=".pdf" onChange={handleFileChange} />
        
        {pdfFile && (
          <div style={{ marginTop: "20px" }}>
            <PDFViewer file={pdfFile} />
          </div>
        )}
      </div>
    </>
  );
}
