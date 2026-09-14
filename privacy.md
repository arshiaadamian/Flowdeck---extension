# Privacy Policy for Flowdeck

**Last updated: April 2026**

## Overview

Flowdeck is a Chrome extension built for BCIT students to track and calculate grades from the BCIT Learning Hub. This privacy policy explains what data Flowdeck accesses and how it is handled.

## Data We Access

Flowdeck accesses the following data solely to provide its grade tracking functionality:

- **Website content** — Flowdeck reads grade data from your BCIT Learning Hub pages and course outline pages on bcit.ca. This data is used only to calculate and display your grades within the extension.

## Data Storage

- All grade data is stored **locally on your device** using Chrome's built-in `chrome.storage.local` API. This data never leaves your device except as described below.
- Cached course outline structures are also stored locally on your device so that future loads are instant.

## Data Sent to Our Server

- When Flowdeck fetches a course outline for the first time, the evaluation table HTML from that outline page is sent to our backend server solely to extract grade weights using an AI model.
- This data is **not stored permanently** on our server. It is processed and discarded after the response is returned.
- The results are cached temporarily in server memory to avoid redundant AI calls for the same course.

## Data We Do Not Collect

- We do not collect, store, or share any personally identifiable information.
- We do not collect your name, email, student ID, or any other personal details.
- We do not sell or transfer any user data to third parties.
- We do not use data for any purpose unrelated to grade tracking.

## Third Party Services

Flowdeck uses the Groq API to process course outline text. Only the evaluation criteria table from the course outline is sent — no personal information or grade data is ever sent to Groq.

## Contact

If you have any questions about this privacy policy, please contact us at adamianarshia@gmail.com.
