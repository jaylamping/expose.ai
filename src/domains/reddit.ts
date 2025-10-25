/**
 * Content script that runs on Reddit pages
 * Injects "Analyze" buttons next to usernames
 */

// Track which users have already been processed
const processedAuthors = new Set<string>();

// Inject analyze buttons into Reddit comments/posts
function injectAnalyzeButtons() {
  // For new Reddit (reddit.com) - multiple selector strategies
  const selectors = [
    // New Reddit with slot="commentMeta"
    '[slot="commentMeta"] a[href*="/user/"]',
    'div[slot="commentMeta"] a[href^="/user/"]',
    // New Reddit with slot elements
    'slot#comment-meta a[href*="/user/"]',
    'slot[name="commentMeta"] a[href*="/user/"]',
    // Standard new Reddit
    '[data-testid="comment"] [data-testid="comment_author_link"]',
    '[data-testid="post-author-link"]',
    // Alternative new Reddit patterns
    'faceplate-tracker a[href^="/user/"]',
    'shreddit-comment a[href*="/user/"]',
    '.author-name-meta a[href^="/user/"]',
  ];

  const authorElements: Element[] = [];

  // Collect all author elements from different selectors
  selectors.forEach((selector) => {
    try {
      const elements = document.querySelectorAll(selector);
      elements.forEach((el) => {
        // Only add if it's actually a user link
        const href = el.getAttribute("href");
        if (href && href.includes("/user/")) {
          authorElements.push(el);
        }
      });
    } catch (e) {
      // Selector might not be valid in all cases
    }
  });

  authorElements.forEach((authorElement) => {
    const username = authorElement.textContent?.trim().replace(/^u\//, "");

    if (!username || username === "[deleted]" || username === "[removed]") {
      return;
    }

    // Create a more unique key based on the element itself
    const uniqueKey = `${username}-${authorElement.getAttribute("href") || ""}`;

    if (processedAuthors.has(uniqueKey)) {
      return;
    }

    processedAuthors.add(uniqueKey);

    // Create analyze button
    const analyzeBtn = document.createElement("button");
    analyzeBtn.textContent = "🤖 Analyze";
    analyzeBtn.className = "expose-ai-analyze-btn";
    analyzeBtn.style.cssText = `
      display: inline-flex;
      margin-left: 8px;
      align-items: center;
      justify-content: center;
      max-height: 16px;
      padding: 0 8px;
      font-size: 11px;
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      color: white;
      border: none;
      border-radius: 12px;
      cursor: pointer;
      font-weight: 400;
      transition: all 0.2s;
      opacity: 0.8;
      vertical-align: middle;
    `;

    analyzeBtn.onmouseover = () => {
      analyzeBtn.style.opacity = "1";
      analyzeBtn.style.transform = "scale(1.05)";
    };

    analyzeBtn.onmouseout = () => {
      analyzeBtn.style.opacity = "0.8";
      analyzeBtn.style.transform = "scale(1)";
    };

    analyzeBtn.onclick = async (e) => {
      e.preventDefault();
      e.stopPropagation();
      console.log(`Analyze user clicked: ${username}`);

      // Show loading state
      analyzeBtn.textContent = "⏳ Analyzing...";
      analyzeBtn.style.cursor = "wait";

      try {
        // Fetch user comments from background script
        const response = await chrome.runtime.sendMessage({
          type: "FETCH_USER_COMMENTS",
          username: username,
        });

        if (response.success) {
          console.log(
            `Successfully fetched ${response.comments.length} comments for ${username}:`,
            response.comments
          );
          analyzeBtn.textContent = "✅ Done";
          analyzeBtn.style.background =
            "linear-gradient(135deg, #28a745 0%, #20c997 100%)";
        } else {
          console.error(
            `Failed to fetch comments for ${username}:`,
            response.error
          );
          analyzeBtn.textContent = "❌ Error";
          analyzeBtn.style.background =
            "linear-gradient(135deg, #dc3545 0%, #c82333 100%)";
          alert(`Error: ${response.error}`);
        }
      } catch (error) {
        console.error(`Error analyzing ${username}:`, error);
        analyzeBtn.textContent = "❌ Error";
        analyzeBtn.style.background =
          "linear-gradient(135deg, #dc3545 0%, #c82333 100%)";
        alert(`Error: ${(error as Error).message}`);
      } finally {
        // Reset button after a delay
        setTimeout(() => {
          analyzeBtn.textContent = "🤖 Analyze";
          analyzeBtn.style.background =
            "linear-gradient(135deg, #667eea 0%, #764ba2 100%)";
          analyzeBtn.style.cursor = "pointer";
        }, 3000);
      }
    };

    // Try multiple insertion strategies
    const parentElement = authorElement.parentElement;
    if (parentElement) {
      // Check if we're in a slot context
      const slotParent = authorElement.closest("slot");
      if (slotParent) {
        // Insert after the slot element
        slotParent.insertAdjacentElement("afterend", analyzeBtn);
      } else {
        // Standard insertion
        authorElement.insertAdjacentElement("afterend", analyzeBtn);
      }
    }
  });

  // For old Reddit (old.reddit.com)
  const oldRedditAuthors = document.querySelectorAll(
    ".author:not(.submitter):not(.moderator)"
  );

  oldRedditAuthors.forEach((authorElement) => {
    const username = authorElement.textContent?.trim();

    if (!username || username === "[deleted]" || username === "[removed]") {
      return;
    }

    const commentId =
      authorElement.closest(".comment")?.getAttribute("data-fullname") ||
      "post";
    const uniqueKey = `${username}-${commentId}`;

    if (processedAuthors.has(uniqueKey)) {
      return;
    }

    processedAuthors.add(uniqueKey);

    const analyzeBtn = document.createElement("a");
    analyzeBtn.textContent = "[🤖 analyze]";
    analyzeBtn.className = "expose-ai-analyze-btn";
    analyzeBtn.style.cssText = `
      margin-left: 4px;
      color: #7c7cf0;
      font-weight: bold;
      cursor: pointer;
    `;

    analyzeBtn.onclick = async (e) => {
      e.preventDefault();
      e.stopPropagation();
      console.log(`Analyze user clicked: ${username}`);

      // Show loading state
      analyzeBtn.textContent = "[⏳ analyzing...]";
      analyzeBtn.style.cursor = "wait";

      try {
        // Fetch user comments from background script
        const response = await chrome.runtime.sendMessage({
          type: "FETCH_USER_COMMENTS",
          username: username,
        });

        if (response.success) {
          console.log(
            `Successfully fetched ${response.comments.length} comments for ${username}:`,
            response.comments
          );
          analyzeBtn.textContent = "[✅ done]";
          analyzeBtn.style.color = "#28a745";
        } else {
          console.error(
            `Failed to fetch comments for ${username}:`,
            response.error
          );
          analyzeBtn.textContent = "[❌ error]";
          analyzeBtn.style.color = "#dc3545";
          alert(`Error: ${response.error}`);
        }
      } catch (error) {
        console.error(`Error analyzing ${username}:`, error);
        analyzeBtn.textContent = "[❌ error]";
        analyzeBtn.style.color = "#dc3545";
        alert(`Error: ${(error as Error).message}`);
      } finally {
        // Reset button after a delay
        setTimeout(() => {
          analyzeBtn.textContent = "[🤖 analyze]";
          analyzeBtn.style.color = "#7c7cf0";
          analyzeBtn.style.cursor = "pointer";
        }, 3000);
      }
    };

    authorElement.insertAdjacentElement("afterend", analyzeBtn);
  });
}

// Initialize
function init() {
  // Inject buttons initially
  injectAnalyzeButtons();

  // Re-inject buttons when new content loads (for infinite scroll)
  const observer = new MutationObserver(() => {
    injectAnalyzeButtons();
  });

  observer.observe(document.body, {
    childList: true,
    subtree: true,
  });

  console.log("Expose.AI: Content script loaded on Reddit");
}

// Wait for page to be ready
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", init);
} else {
  init();
}
