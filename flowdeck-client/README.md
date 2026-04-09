# Flowdeck Chrome Extension

A Chrome extension for course grade tracking and calculation (UI skeleton only).

## Setup Instructions

1. **Create Icon Files**: The extension requires PNG icon files. You can:
   - Use the `create_icons.html` file: Open it in a browser to generate the icon files
   - Or create your own 16x16, 48x48, and 128x128 PNG images
   - Place them in the `icons/` folder as:
     - `icon16.png` (16x16 pixels)
     - `icon48.png` (48x48 pixels)
     - `icon128.png` (128x128 pixels)

2. **Load Extension in Chrome**:
   - Open Chrome and navigate to `chrome://extensions`
   - Enable "Developer mode" (toggle in top-right)
   - Click "Load unpacked"
   - Select this extension folder
   - The extension will appear in your toolbar

## File Structure

- `manifest.json` - Extension manifest (Manifest V3)
- `popup.html` - Main popup UI
- `popup.css` - Stylesheet
- `popup.js` - Basic UI interactions (console.log only)
- `icons/` - Icon files directory
  - `logo.svg` - Logo for popup header
  - `icon16.png` - 16x16 icon (create this)
  - `icon48.png` - 48x48 icon (create this)
  - `icon128.png` - 128x128 icon (create this)

## Notes

- This is a UI skeleton only - no functionality is implemented
- All buttons log to console when clicked
- No data storage or calculations are performed
- Placeholder values are used throughout
