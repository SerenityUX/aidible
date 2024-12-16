export function createHighlights(containerRef, highlightLayerRef, highlightText, styles) {
  if (!containerRef.current || !highlightText) {
    console.log("No highlight text:", highlightText);
    return;
  }

  const textLayer = containerRef.current.querySelector('.react-pdf__Page__textContent');
  if (!textLayer) {
    console.log("No text layer found");
    return;
  }

  // Create or get highlight layer
  if (!highlightLayerRef.current) {
    highlightLayerRef.current = document.createElement('div');
    highlightLayerRef.current.className = styles.highlightLayer;
    textLayer.parentElement.appendChild(highlightLayerRef.current);
  }

  // Clear existing highlights
  highlightLayerRef.current.innerHTML = '';

  // Clean search text once
  const searchText = highlightText.trim().toLowerCase();
  if (!searchText) return;

  // Get all spans at once
  const spans = Array.from(textLayer.getElementsByTagName('span'));

  // Build combined text and track span positions
  let combinedText = '';
  const spanPositions = spans.map(span => {
    const start = combinedText.length;
    const text = span.textContent.toLowerCase();
    combinedText += text + ' ';
    return {
      span,
      text,
      start,
      end: combinedText.length - 1
    };
  });

  // Find the search text in the combined text
  const searchIndex = combinedText.indexOf(searchText);
  if (searchIndex === -1) return;

  const searchEnd = searchIndex + searchText.length;

  // Find all spans that overlap with our search range
  const relevantSpans = spanPositions.filter(({ start, end }) => {
    return (start <= searchIndex && end > searchIndex) || 
           (start >= searchIndex && end <= searchEnd) || 
           (start < searchEnd && end >= searchEnd);
  });

  // Create highlights for each relevant span
  const fragment = document.createDocumentFragment();
  
  relevantSpans.forEach(({ span, text, start, end }) => {
    const highlight = createHighlightElement({
      span,
      text,
      start,
      end,
      searchIndex,
      searchEnd,
      containerRef,
      styles
    });
    
    fragment.appendChild(highlight);
  });

  highlightLayerRef.current.appendChild(fragment);
}

function createHighlightElement({ span, text, start, end, searchIndex, searchEnd, containerRef, styles }) {
  const rect = span.getBoundingClientRect();
  const containerRect = containerRef.current.getBoundingClientRect();
  
  const highlight = document.createElement('div');
  highlight.className = styles.highlight;
  
  // Calculate what portion of this span should be highlighted
  const spanLength = text.length;
  
  let highlightStart = 0;
  let highlightWidth = rect.width;

  if (start < searchIndex) {
    // This span contains the start of our highlight
    const charsBeforeHighlight = searchIndex - start;
    
    // Add a small buffer for capital letters and variable-width fonts
    const letterBuffer = 0.5;
    highlightStart = Math.max(0, ((charsBeforeHighlight - letterBuffer) / spanLength) * rect.width);
    
    // Adjust width to account for the buffer
    const effectiveCharsHighlighted = spanLength - charsBeforeHighlight + letterBuffer;
    highlightWidth = (effectiveCharsHighlighted / spanLength) * rect.width;
  }

  if (end > searchEnd) {
    // This span contains the end of our highlight
    const charsInHighlight = searchEnd - Math.max(searchIndex, start);
    highlightWidth = ((charsInHighlight + 0.5) / spanLength) * rect.width;
  }

  // Ensure we don't exceed the span's bounds
  highlightWidth = Math.min(highlightWidth, rect.width - highlightStart);

  const left = rect.left - containerRect.left + highlightStart;
  const top = rect.top - containerRect.top;
  
  highlight.style.cssText = `
    left: ${left}px;
    top: ${top}px;
    width: ${highlightWidth}px;
    height: ${rect.height}px;
    background: rgba(167, 57, 251, 0.08);
    box-shadow: 0 0 4px rgba(167, 57, 251, 0.05);
  `;
  
  return highlight;
} 