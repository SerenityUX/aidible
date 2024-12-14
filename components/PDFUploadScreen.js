import React, { useState } from 'react';

const PDFUploadScreen = ({ onFileSelect }) => {
  const [isDragging, setIsDragging] = useState(false);
  const [error, setError] = useState('');

  const handleDrag = (e) => {
    e.preventDefault();
    e.stopPropagation();
  };

  const handleDragIn = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  };

  const handleDragOut = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  };

  const handleDrop = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
    setError('');

    const files = e.dataTransfer.files;
    if (files && files[0]) {
      const file = files[0];
      if (file.type === 'application/pdf') {
        onFileSelect({ target: { files: [file] } });
      } else {
        setError('Sorry, only PDFs accepted');
      }
    }
  };

  const handleFileInput = (e) => {
    setError('');
    const file = e.target.files[0];
    if (file && file.type !== 'application/pdf') {
      setError('Sorry, only PDFs accepted');
      e.target.value = '';
      return;
    }
    onFileSelect(e);
  };

  const onClick = () => {
    document.getElementById('file-input').click();
  };

  return (
    <div
      style={{ 
        height: '100vh', 
        width: '100vw',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: "20px",
        position: 'relative',
        backgroundColor: isDragging ? 'rgba(167, 57, 251, 0.05)' : 'white',
        transition: 'background-color 0.2s ease'
      }}
      onDragEnter={handleDragIn}
      onDragLeave={handleDragOut}
      onDragOver={handleDrag}
      onDrop={handleDrop}
    >
      <img style={{ maxWidth: "100%", width: 300 }} src="./aidble.svg" alt="Aidble logo" />
      
      <div 
        onClick={onClick}
        style={{
          border: `2px dashed ${isDragging ? '#A739FB' : '#ccc'}`,
          borderRadius: '16px',
          padding: '60px',
          textAlign: 'center',
          marginTop: '40px',
          transition: 'all 0.2s ease',
          background: isDragging ? 
            'linear-gradient(180deg, rgba(167, 57, 251, 0.1) -0.14%, rgba(136, 25, 220, 0.1) 103.43%)' : 
            'transparent',
          width: '100%',
          maxWidth: '700px',
          minHeight: '350px',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'center',
          alignItems: 'center',
          cursor: 'pointer',
          ':hover': {
            borderColor: '#A739FB',
            background: 'linear-gradient(180deg, rgba(167, 57, 251, 0.05) -0.14%, rgba(136, 25, 220, 0.05) 103.43%)'
          }
        }}
      >
        <img 
          src="./book.svg" 
          alt="Book icon" 
          style={{
            height: '24px',
            width: '24px',
            marginBottom: '16px'
          }}
        />
        <p style={{
          color: isDragging ? '#8819DC' : '#666',
          fontWeight: isDragging ? '500' : 'normal',
          fontSize: '1.2rem',
          marginBottom: '8px'
        }}>
          Drop your book in here
        </p>
        <span
          onClick={(e) => {
            e.stopPropagation();
            document.getElementById('file-input').click();
          }}
          style={{
            color: '#A739FB',
            fontSize: '1.1rem',
            cursor: 'pointer',
            textDecoration: 'underline',
            transition: 'opacity 0.2s ease',
            ':hover': {
              opacity: 0.8
            }
          }}
        >
          Select your eBook (pdf)
        </span>
        <input 
          id="file-input"
          type="file" 
          accept=".pdf" 
          onChange={handleFileInput}
          style={{
            display: 'none'
          }}
        />
      </div>

      {error && (
        <p style={{ 
          color: '#A739FB', 
          marginTop: '10px',
          fontSize: '14px',
          fontWeight: '500'
        }}>
          {error}
        </p>
      )}
    </div>
  );
};

export default PDFUploadScreen; 