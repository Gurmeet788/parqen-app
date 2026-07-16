import { toast } from 'react-toastify';

/**
 * Safely copies text to the clipboard, even in insecure contexts (non-HTTPS/non-localhost LAN IPs)
 * @param {string} text - The text to copy
 * @param {string} successMessage - Optional toast success message to show
 */
export const copyToClipboard = (text, successMessage = 'Copied to clipboard!') => {
  if (navigator.clipboard && navigator.clipboard.writeText) {
    return navigator.clipboard.writeText(text)
      .then(() => {
        if (successMessage) toast.success(successMessage);
        return true;
      })
      .catch((err) => {
        console.error('Failed to copy: ', err);
        return fallbackCopy(text, successMessage);
      });
  } else {
    return Promise.resolve(fallbackCopy(text, successMessage));
  }
};

const fallbackCopy = (text, successMessage) => {
  const textarea = document.createElement('textarea');
  textarea.value = text;
  textarea.style.position = 'fixed'; // prevent scrolling to bottom of screen
  textarea.style.opacity = '0';
  document.body.appendChild(textarea);
  textarea.select();
  try {
    const successful = document.execCommand('copy');
    if (successful) {
      if (successMessage) toast.success(successMessage);
      return true;
    } else {
      toast.error('Failed to copy text.');
      return false;
    }
  } catch (err) {
    console.error('Fallback copy failed: ', err);
    toast.error('Failed to copy text.');
    return false;
  } finally {
    document.body.removeChild(textarea);
  }
};
