import icon from "../public/icon.png";
import "./App.css";

function App() {
  const handleClick = async () => {
    const [tab] = await chrome.tabs.query({
      active: true,
      currentWindow: true,
    });

    chrome.scripting.executeScript({
      target: { tabId: tab.id! },
      func: () => {
        // reference current tab body
        console.log("weeeeeeeeeee");
      },
    });
  };

  return (
    <>
      <div>
        <a href="https://expose.ai" target="_blank">
          <img src={icon} className="logo" alt="expose.ai" />
        </a>
      </div>
      <h1>expose.ai</h1>
      <div className="card">
        <button onClick={handleClick}>Click me</button>
      </div>
    </>
  );
}

export default App;
