import Image from 'next/image';
import styles from './index.module.css';

export function OpenWindow() {
  const toggleWindow = () => {
    const url = window.location.href;
    window.open(url, '_blank');
  };

  return (
    <button
      onClick={toggleWindow}
      className={styles.themeToggle}
      aria-label="Open in new window"
    >
      <Image
        src="/window.svg"
        alt="Window icon"
        className={styles.themeIcon}
        width={24}
        height={24}
      />
    </button>
  );
}