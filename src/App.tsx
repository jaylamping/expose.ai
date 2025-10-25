import { useState, useEffect } from 'react';
import icon from '/icon.png';
import './App.css';

function App() {
  const [isAuthenticated, setIsAuthenticated] = useState<boolean | null>(null);
  const [isAuthenticating, setIsAuthenticating] = useState(false);

  useEffect(() => {
    checkAuthStatus();
  }, []);

  const checkAuthStatus = async () => {
    const inExtension =
      typeof chrome !== 'undefined' &&
      !!chrome.runtime &&
      !!chrome.runtime.id &&
      typeof chrome.runtime.sendMessage === 'function';

    if (!inExtension) {
      console.warn(
        'Not running inside an extension context. Build and load the unpacked extension, then open the popup.'
      );
      setIsAuthenticated(false);
      return;
    }
    try {
      const response = await chrome.runtime.sendMessage({
        type: 'CHECK_AUTH_STATUS',
      });
      setIsAuthenticated(response.authenticated);
    } catch (error) {
      console.error('Error checking auth status:', error);
      setIsAuthenticated(false);
    }
  };

  const handleAuthenticate = async () => {
    setIsAuthenticating(true);
    try {
      const inExtension =
        typeof chrome !== 'undefined' &&
        !!chrome.runtime &&
        !!chrome.runtime.id &&
        typeof chrome.runtime.sendMessage === 'function';

      if (!inExtension) {
        throw new Error(
          'Popup is not running as a Chrome extension page. Run `npm run build`, load `dist` as an unpacked extension, and open the popup from the toolbar icon.'
        );
      }
      const response = await chrome.runtime.sendMessage({
        type: 'AUTHENTICATE_REDDIT',
      });

      if (response.success) {
        await checkAuthStatus();
      } else {
        alert(`Authentication failed: ${response.error}`);
      }
    } catch (error) {
      console.error('Authentication error:', error);
      alert(`Error: ${(error as Error).message}`);
    } finally {
      setIsAuthenticating(false);
    }
  };

  return (
    <>
      <div>
        <a href='https://expose.ai' target='_blank'>
          <img src={icon} className='logo' alt='expose.ai' />
        </a>
      </div>
      <h1>expose.ai</h1>

      <div className='card'>
        {isAuthenticated === null && <p>Checking authentication...</p>}

        {isAuthenticated === false && (
          <>
            <p>Authenticate with Reddit to analyze users</p>
            <button onClick={handleAuthenticate} disabled={isAuthenticating}>
              {isAuthenticating ? 'Authenticating...' : '🔐 Authenticate'}
            </button>
          </>
        )}

        {isAuthenticated === true && (
          <>
            <p style={{ color: '#28a745', fontWeight: 'bold' }}>
              ✅ Ready to analyze
            </p>
            <p style={{ fontSize: '14px', color: '#666' }}>
              Visit Reddit and click "🤖 Analyze" next to usernames
            </p>
          </>
        )}
      </div>
    </>
  );
}

export default App;
