const express = require('express');   // Import the Express library
const cors = require('cors');         // Import the CORS middleware
const { GoogleGenerativeAI } = require('@google/generative-ai'); // Import the Google Generative AI library
require('dotenv').config(); // Load environment variables from the .env file


// create an instance of the Express application
const app = express();
app.use(cors()); // Use the CORS middleware for all origins
app.use(express.json()); // Middleware to parse JSON bodies, makes sure when a request arrives with a JSON body, it automatically gets parsed into a JavaScript Object so you can access it via req.body in your route handlers.
const port  = 3000;
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY); // Initialize the Google Generative AI client with the API key from environment variables
const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });// Get the specific generative model to use for generating responses

// define a basic route
app.get('/', (req, res) => {
    res.send("hello world");
})

// parse-outline POST route to be used by the client side to send the outline text for parsing it, meaning sending it to AI with prompt to extract grade weights in a structured format 
app.post('/parse-outline', async (req, res) => {
    const {text} = req.body;
    console.log("Received outline text for parsing: ", text);
    if (!text) {
        return res.status(400).json({ error: 'Outline text not provided' }); // sends a json response to the clint using res.json()
    }

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
        const result = await model.generateContent(prompt);
        console.log("result is: " + JSON.stringify(result));
        const responseText = result.response;
        const AItext = responseText.text(); // method to return the string from the response object.
        const weights = JSON.parse(AItext); // parse the response text JSON as JavaScript object

        res.json({ weights: weights }); // send the parsed weights back to the client as JSON, under the "weights" array
    }
    catch (err) {
        console.error("Error parsing outline: ", err);
        res.status(500).json({ error: 'failed to parse outline' });
    }
});


// start the server and listen on the specified port
app.listen(port, () => {
    console.log("server is running at http://localhost:" + port);
})
