const express = require('express');   // Import the Express library
const cors = require('cors');         // Import the CORS middleware
require('dotenv').config(); // Load environment variables from the .env file

// const { GoogleGenerativeAI } = require('@google/generative-ai'); // Import the Google Generative AI library
const Groq = require('groq-sdk');
const groq = new Groq({apiKey: process.env.GROQ_API_KEY});



// create an instance of the Express application
const app = express();
app.use(cors()); // Use the CORS middleware for all origins
app.use(express.json()); // Middleware to parse JSON bodies, makes sure when a request arrives with a JSON body, it automatically gets parsed into a JavaScript Object so you can access it via req.body in your route handlers.
const port  = 3000;
// gemini-2.5-flash
// gemini-robotics-er-1.5-preview
// const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY); // Initialize the Google Generative AI client with the API key from environment variables
// const model = genAI.getGenerativeModel({ model: "gemini-robotics-er-1.5-preview" });// Get the specific generative model to use for generating responses

// cache object, includes the termNumber + CRN as key values, and each key is an object consisting of two other objects called "parse-outline" and "map-categories"
const cache = {};

// define a basic route
app.get('/', (req, res) => {
    res.send("hello world");
})

// parse-outline POST route to be used by the client side to send the outline text for parsing it, meaning sending it to AI with prompt to extract grade weights in a structured format 
app.post('/parse-outline', async (req, res) => {
    const {text, cacheKey} = req.body;
    console.log("Received outline text for parsing: ", text);
    if (!text || !cacheKey) {
        return res.status(400).json({ error: 'Outline text not provided' }); // sends a json response to the clint using res.json()
    }

    if (!cache[cacheKey])
    {
        try 
        {
            const prompt = `Extract the evaluation criteria from this course outline. Return only a JSON array where each object has a "name" (string) and "weight" (number). No explanation, no markdown, no code blocks, just the raw JSON array.

                            Example output:
                            [
                                { "name": "Assignments", "weight": 30 },
                                { "name": "Midterm", "weight": 30 },
                                { "name": "Final Exam", "weight": 40 }
                            ]

                            Course outline text:
                            ${text}`;

            console.log("Sending prompt to AI");

            // const result = await model.generateContent(prompt);
            const result = await groq.chat.completions.create({
                model: "llama-3.3-70b-versatile",
                messages: [{role: "user", content: prompt}]
            })

            console.log("result is: " + JSON.stringify(result));

            // const responseText = result.response;
            // const AItext = responseText.text(); // method to return the string from the response object.
            const AItext = result.choices[0].message.content;
            const weights = JSON.parse(AItext); // parse the response text JSON as JavaScript object

            cache[cacheKey] = {};
            cache[cacheKey]['parse_outline'] = weights;
            
            console.log("cache for first AI(parse outline) is: " + JSON.stringify(cache[cacheKey]['parse_outline']));

            res.json({ weights: weights }); // send the parsed weights back to the client as JSON, under the "weights" array
        }
        catch (err) {
            console.error("Error parsing outline: ", err);
            res.status(500).json({ error: 'failed to parse outline' });
        }
    }
    else
    {
        try
        {
            console.log("cache for first AI(parse outline) is: " + JSON.stringify(cache[cacheKey]['parse_outline']));
            res.json({weights: cache[cacheKey]['parse_outline']});
        }
        catch (err) {
            console.error("Error parsing outline: ", err);
            res.status(500).json({ error: 'failed to parse outline' });
        }
    }

    
});


// parse learning hub and course outline to make sure values in the outline are correctly matched to the course items.
app.post('/map-categories', async (req, res) => {
    const {outlineCategories, learningHubItems, cacheKey} = req.body;
    if (!outlineCategories || !learningHubItems || !cacheKey) {
        return res.status(400).json({ error: 'Missing outlineCategories or learningHubItems in request body' });
    }

    if (!cache[cacheKey]['map_categories'])
    {
        try {
        const prompt = `You are a course structure mapper. You will receive two pieces of data:
                        1. A list of outline categories with their weights from the official course outline
                        2. A list of Learning Hub categories, each with their items

                        Your job is to match each outline category to the correct Learning Hub category or categories.

                        Rules:
                        - You MUST return Learning Hub category names EXACTLY as provided in the input — do not rephrase, abbreviate, or modify them in any way
                        - One outline category can map to multiple Learning Hub categories if they logically belong together
                        - If no Learning Hub category matches an outline category, return an empty array for learningHubCategories — do NOT guess or assign random categories
                        - Every Learning Hub category must be assigned to exactly one outline category — do not leave any unassigned
                        - Return ONLY a raw JSON array, no markdown, no explanation, no code blocks

                        Expected output format:
                        [
                        { "outlineCategory": "string", "weight": number, "learningHubCategories": ["exact name as given"] },
                        { "outlineCategory": "string", "weight": number, "learningHubCategories": [] }
                        ]

                        Outline categories:
                        ${JSON.stringify(outlineCategories)}

                        Learning Hub categories:
                        ${JSON.stringify(learningHubItems)}`;

        console.log("sending prompt to the second AI for mapping.");

        // const result = await model.generateContent(prompt);
        const result = await groq.chat.completions.create({
            model: "llama-3.3-70b-versatile",
            messages: [{ role: "user", content: prompt }]
        });
        // const responseText = result.response;
        // const AItext = responseText.text(); // method to return the string from the response object.
        const AItext = result.choices[0].message.content;
        const mappedCategories = JSON.parse(AItext);

        cache[cacheKey]['map_categories'] = mappedCategories;
        console.log("cache for second AI(map cateogires) is: " + JSON.stringify(cache[cacheKey]['map_categories']));
        console.log("cache is: " + JSON.stringify(cache));



        console.log("result is: " + AItext);

        res.json({ mappedCategories: mappedCategories });
        }
        catch (err) {
            console.error("error mapping categories: ", err);
            res.status(500).json({ error: 'failed to map categories' });
        }
    }
    else
    {
        try
        {
            console.log("cache for second AI(map cateogires) is: " + JSON.stringify(cache[cacheKey]['map_categories']));
            res.json({mappedCategories: cache[cacheKey]['map_categories']});
        }
        catch (err) {
            console.error("error mapping categories: ", err);
            res.status(500).json({ error: 'failed to map categories' });
        }
    }
    
});


console.log("cache is: " + JSON.stringify(cache));

// start the server and listen on the specified port
app.listen(port, () => {
    console.log("server is running at http://localhost:" + port);
})
