"use client";

import Head from "next/head";
import { useState } from "react";
import styles from "@/styles/Home.module.css";
import PDFUploadScreen from "../components/PDFUploadScreen";
import dynamic from "next/dynamic";

// Import PDFViewer with no SSR
const PDFViewer = dynamic(() => import("../components/PDFViewer"), {
  ssr: false,
  loading: () => <p></p>,
});

export default function Home() {
  const [selectedFile, setSelectedFile] = useState(null);

  const handleFileSelect = (e) => {
    if (e.target.files?.[0]) {
      setSelectedFile(URL.createObjectURL(e.target.files[0]));
    }
  };

  const handleClose = () => {
    if (selectedFile) {
      URL.revokeObjectURL(selectedFile); // Clean up the URL object
    }
    setSelectedFile(null);
  };

  if (!selectedFile) {
    return <PDFUploadScreen onFileSelect={handleFileSelect} />;
  }

  return <PDFViewer file={selectedFile} onClose={handleClose} />;
}
