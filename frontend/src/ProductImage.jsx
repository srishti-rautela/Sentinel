import React, { useState } from 'react';

/* Shows the real product photo; falls back to the emoji if the image is missing or fails to load. */
export default function ProductImage({ product, className = '', emojiClass = 'text-6xl' }) {
  const [failed, setFailed] = useState(false);
  if (!product?.image || failed) {
    return <span className={emojiClass}>{product?.emoji || '📦'}</span>;
  }
  return (
    <img
      src={product.image}
      alt={product.name}
      loading="lazy"
      onError={() => setFailed(true)}
      className={`object-cover ${className}`}
    />
  );
}