// Flowdeck Background Service Worker
// Handles cross-origin fetching of BCIT course outlines so content scripts
// don't run into CORS errors

console.log('[Flowdeck BG] Service worker loaded');

/**
 * Fetch and parse category weights from a BCIT course outline page.
 * @param {string} outlineUrl - Full URL to outline (e.g., https://www.bcit.ca/outlines/20253037024/)
 * @returns {Promise<{ok: boolean, weights?: Array<{name: string, weight: number}>, error?: string}>}
 */
async function fetchOutlineWeights(outlineUrl) {
    try {
        console.log('[Flowdeck BG] Fetching outline:', outlineUrl);
        
        const response = await fetch(outlineUrl);
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
        }
        
        const htmlText = await response.text();
        const parser = new DOMParser();
        const doc = parser.parseFromString(htmlText, 'text/html');
        
        // Find evaluation table by looking for "Evaluation Criteria" heading
        const headings = doc.querySelectorAll('h3');
        let evalTable = null;
        
        for (const heading of headings) {
            if (heading.textContent.toLowerCase().includes('evaluation criteria')) {
                // Walk siblings to find the table
                let sibling = heading.nextElementSibling;
                while (sibling) {
                    if (sibling.tagName === 'TABLE') {
                        evalTable = sibling;
                        break;
                    }
                    // Sometimes the table is nested in a div
                    const nestedTable = sibling.querySelector('table');
                    if (nestedTable) {
                        evalTable = nestedTable;
                        break;
                    }
                    sibling = sibling.nextElementSibling;
                }
                break;
            }
        }
        
        if (!evalTable) {
            console.warn('[Flowdeck BG] No evaluation table found');
            return { ok: false, error: 'No evaluation table found' };
        }
        
        // Extract weights from table rows
        const weights = [];
        const rows = evalTable.querySelectorAll('tbody tr');
        
        rows.forEach(row => {
            const cells = row.querySelectorAll('td');
            if (cells.length >= 2) {
                const name = cells[0].textContent.trim();
                const weightText = cells[1].textContent.trim();
                const weightMatch = weightText.match(/[\d.]+/);
                
                if (weightMatch) {
                    const weight = parseFloat(weightMatch[0]);
                    weights.push({ name, weight });
                    console.log(`[Flowdeck BG] Found: ${name} = ${weight}%`);
                }
            }
        });
        
        console.log(`[Flowdeck BG] Successfully extracted ${weights.length} weights`);
        return { ok: true, weights };
        
    } catch (error) {
        console.error('[Flowdeck BG] Fetch error:', error);
        return { ok: false, error: error.message };
    }
}

// Message listener for cross-origin fetches
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    console.log('[Flowdeck BG] Message received:', request?.type);
    
    if (request.type === 'FETCH_OUTLINE_WEIGHTS') {
        const { outlineUrl } = request;
        
        if (!outlineUrl) {
            sendResponse({ ok: false, error: 'No outlineUrl provided' });
            return false;
        }
        
        fetchOutlineWeights(outlineUrl).then(result => {
            sendResponse(result);
        }).catch(err => {
            sendResponse({ ok: false, error: err.message });
        });
        
        return true; // Keep channel open for async response
    }
    
    return false;
});