// functions to build a course outline URL using the course number in the course HTML header element
function buildOutlineURLFromCurrentPage(courseKey)
{
    let url = "https://www.bcit.ca/outlines/" + courseKey;
    return url;
}

async function fetchOutlineWeights(outlineURL)
{
    try
    {
        console.log("Fetching outline: " + outlineURL);

        // fetching the HTML from the outline page.
        const response = await fetch(outlineURL);

        if(!response.ok)
        {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }

        // turn the html object to string
        const htmlText = await response.text();

        // parse the HTML string into a DOM document, now it reads that html string and builds a virtual DOM tree in memory
        const parser = new DOMParser();
        const doc = parser.parseFromString(htmlText, 'text/html');

        // find the 'evaluation criteria' section
        const headings = doc.querySelectorAll('h3');
        let evalTable = null;

        for (const heading of headings)
        {
            if (heading.textContent.toLowerCase().includes("evaluation criteria"))
            {
                let sibling = heading.nextElementSibling;
                while(sibling)
                {
                    if (sibling.tagName === 'TABLE')
                    {
                        evalTable = sibling;
                        break;
                    }

                    // check if table is nested in a div
                    const nestedTable = sibling.querySelector('table');
                    if (nestedTable)
                    {
                        evalTable = nestedTable;
                        break;
                    }
                    sibling = sibling.nextElementSibling;
                }
                break;
            }
        }

        if (!evalTable)
        {
            console.warn("No Evaluation table found");
            return [];
        }

        // extract weights from the table
        const weights = [];
        const rows = evalTable.querySelectorAll('tbody tr');

        rows.forEach(row =>
        {
            const cells = row.querySelectorAll('td');
            if (cells.length >= 2)
            {
                const name = cells[0].textContent.trim();
                const weightText = cells[1].textContent.trim();
                // To get the weight as a number, trims any non-numeric characters
                const weightMatch = weightText.match(/[\d.]+/);
                if(weightMatch)
                {
                    const weight = parseFloat(weightMatch[0]);
                    weights.push({name, weight});
                    console.log(`Found: ${name} = ${weight}%`);
                }
            }
        });
        return weights;
    }
    catch(error)
    {
        console.error("Error fetching outlin " + error);
        return [];
    }
}