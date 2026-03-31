import { onAuthReady } from "./authentication.js";
import { db } from "./firebaseConfig.js";
import { doc, onSnapshot, getDoc, collection, getDocs, addDoc, serverTimestamp, updateDoc, arrayUnion, arrayRemove } from "firebase/firestore";


function showName() {

    // Get the DOM element where the user's name will be displayed
    // Example: <h1 id="name-goes-here"></h1>
    const nameElement = document.getElementById("name-goes-here");

    // Wait until Firebase Auth finishes checking the user's auth state
    onAuthReady(async (user) => {

        // If no user is logged in, redirect to the login page
        if (!user) {
            location.href = "index.html";
            return; // Stop execution
        }

        // Get the user's Firestore document from the "users" collection
        // Document ID is the user's unique UID
        const userDoc = await getDoc(doc(db, "users", user.uid));
        const userData = userDoc.exists() ? userDoc.data() : {};

        // Determine which name to display:
        const name = userDoc.exists()            // 1️⃣ Use Firestore name if document exists
            ? userDoc.data().name                // 2️⃣ Otherwise fallback to Firebase displayName
            : user.displayName || user.email;    // 3️⃣ Otherwise fallback to email

        // If the DOM element exists, update its text using a template literal to add "!"
        if (nameElement) {
            nameElement.textContent = `${name}!`;
        }

        //Read bookmarks as a plain array (no globals)
        const bookmarks = userData.bookmarks || [];

        //Display cards, but now pass user's ID and bookmarks (array)
        await displayCardsDynamically(user.uid, bookmarks);

    });
}




// Function to read the quote of the day from Firestore
function readQuote(day) {
    const quoteDocRef = doc(db, "quotes", day); // Get a reference to the document

    onSnapshot(quoteDocRef, docSnap => { // Listen for real-time updates
        if (docSnap.exists()) {          //Document existence check
            document.getElementById("quote-goes-here").innerHTML = docSnap.data().quote;
        } else {
            console.log("No such document!");
        }
    }, (error) => {                      //Listener/system error
        console.error("Error listening to document: ", error);
    });
}

readQuote("tuesday");


// Helper function to add the sample hike documents.
function addHikeData() {
    const hikesRef = collection(db, "hikes");
    console.log("Adding sample hike data...");
    addDoc(hikesRef, {
        code: "BBY01.jpg", name: "Burnaby Lake Park Trail", city: "Burnaby",
        level: "easy", details: "A lovely place for a lunch walk.", length: 10,
        hike_time: 60, lat: 49.2467097082573, lng: -122.9187029619698,
        last_updated: serverTimestamp()
    });
    addDoc(hikesRef, {
        code: "AM01.jpg", name: "Buntzen Lake Trail", city: "Anmore",
        level: "moderate", details: "Close to town, and relaxing.", length: 10.5,
        hike_time: 80, lat: 49.3399431028579, lng: -122.85908496766939,
        last_updated: serverTimestamp()
    });
    addDoc(hikesRef, {
        code: "NV01.jpg", name: "Mount Seymour Trail", city: "North Vancouver",
        level: "hard", details: "Amazing ski slope views.", length: 8.2,
        hike_time: 120, lat: 49.38847101455571, lng: -122.94092543551031,
        last_updated: serverTimestamp()
    });
}
// Seeds the "hikes" collection with initial data if it is empty
function seedHikes() {
    // Get a reference to the "hikes" collection
    const hikesRef = collection(db, "hikes");
    // Retrieve all documents currently in the collection
    getDocs(hikesRef)
        .then(function (querySnapshot) {
            // If no documents exist, the collection is empty
            if (querySnapshot.empty) {
                console.log("Hikes collection is empty. Seeding data...");

                // Call function to insert default hike documents
                addHikeData();
            } else {
                // If documents already exist, do not reseed
                console.log("Hikes collection already contains data. Skipping seed.");
            }
        })
        .catch(function (error) {
            console.error("Error checking hikes collection:", error);
        });
}


//---------------------------------------------------------------------------------
// This function is called when the page loads (from showName())
// It will populate the Gallery with one card for each Hike. 
// For each Hike it can decide if the bookmark icon is solid or outline
// based on the the User's ID, and bookmarks array
//---------------------------------------------------------------------------------
async function displayCardsDynamically(userId, bookmarks) {
    let cardTemplate = document.getElementById("hikeCardTemplate");
    const hikesCollectionRef = collection(db, "hikes");

    try {
        const querySnapshot = await getDocs(hikesCollectionRef);
        querySnapshot.forEach(docSnap => {
            // Clone the card template
            let newcard = cardTemplate.content.cloneNode(true);
            const hike = docSnap.data(); // Get hike data once

            // Populate the card with hike data
            newcard.querySelector('.card-title').textContent = hike.name;
            newcard.querySelector('.card-text').textContent = hike.details || `Located in ${hike.city}.`;
            newcard.querySelector('.card-length').textContent = hike.length;

            newcard.querySelector('.card-image').src = `./images/${hike.code}.jpg`;

            // Add the link with the document ID
            newcard.querySelector(".read-more").href = `eachHike.html?docID=${docSnap.id}`;

            // -------- NEW CODE STARTS HERE ---------
            const hikeDocID = docSnap.id;
            const icon = newcard.querySelector("i.material-icons");

            // Give this icon a unique id based on the hike ID
            icon.id = "save-" + hikeDocID;

            // Decide initial state from bookmarks array
            const isBookmarked = bookmarks.includes(hikeDocID);

            // Set initial bookmark icon based on whether this hike is already in the user's bookmarks
            icon.innerText = isBookmarked ? "bookmark" : "bookmark_border";

            // On click, call a toggleBookmark
            icon.onclick = () => toggleBookmark(userId, hikeDocID);
            // -------- NEW CODE ENDS HERE ---------

            // Attach the new card to the container
            document.getElementById("hikes-go-here").appendChild(newcard);
        });
    } catch (error) {
        console.error("Error getting documents: ", error);
    }
}
async function toggleBookmark(userId, hikeDocID) {
    const userRef = doc(db, "users", userId);     // get a pointer to the user's document
    const userSnap = await getDoc(userRef);       // read the user's document one time
    const userData = userSnap.data() || {};       // default to empty user data
    const bookmarks = userData.bookmarks || [];   // default to empty bookmarks array

    const iconId = "save-" + hikeDocID;           // construct icon's unique ID given the hike ID
    const icon = document.getElementById(iconId); // get a pointer to icon DOM

    // JS function ".includes" will return true if an item is found in the array
    const isBookmarked = bookmarks.includes(hikeDocID);

    // Because this block of code as two aynchronous calls that can be risky/fail
    // Here's an example of how to wrap it with a try/catch structure for error handling. 
    try {
        if (isBookmarked) {
            // Remove from Firestore array
            await updateDoc(userRef, { bookmarks: arrayRemove(hikeDocID) });
            // Update the bookmark icon DOM
            icon.innerText = "bookmark_border";

        } else {
            // Add to Firestore array
            await updateDoc(userRef, { bookmarks: arrayUnion(hikeDocID) });
            // Update the bookmark icon DOM 
            icon.innerText = "bookmark";
        }
    } catch (err) {
        console.error("Error toggling bookmark:", err);
    }
}

async function renderSavedHikes(userId) {
    const hikeCardGroup = document.getElementById("hikeCardGroup");
    const newcardTemplate = document.getElementById("savedCardTemplate");

    // Clear existing cards
    hikeCardGroup.innerHTML = "";

    try {
        const userRef = doc(db, "users", userId);
        const userDocSnap = await getDoc(userRef);

        if (!userDocSnap.exists()) {
            console.log("User does not exist:", userId);
            hikeCardGroup.innerHTML = "<p>User does not exist.</p>";
            return;
        }

        const userData = userDocSnap.data();
        const bookmarks = userData.bookmarks || [];

        if (bookmarks.length === 0) {
            hikeCardGroup.innerHTML = "<p>No saved hikes found.</p>";
            return;
        }

        for (const hikeId of bookmarks) {
            try {
                const hikeRef = doc(db, "hikes", hikeId);
                const hikeDocSnap = await getDoc(hikeRef);

                if (!hikeDocSnap.exists()) {
                    console.log("No hike document for ID", hikeId);
                    continue;
                }

                const hikeData = hikeDocSnap.data();
                const newcard = newcardTemplate.content.cloneNode(true);
                newcard.querySelector(".card-title").innerText = hikeData.name;
                newcard.querySelector(".card-text").textContent = hikeData.details || `Located in ${hikeData.city}.`;
                newcard.querySelector(".card-length").innerText = hikeData.length;
                newcard.querySelector(".card-image").src = `./images/${hikeData.code}.jpg`;
                newcard.querySelector("a").href = "eachHike.html?docID=" + hikeId;
                hikeCardGroup.appendChild(newcard);

            } catch (hikeError) {
                console.error("Error loading hike:", hikeId, hikeError);
            }
        }

    } catch (error) {
        console.error("Error rendering saved hikes:", error);
        hikeCardGroup.innerHTML = "<p>Something went wrong while loading saved hikes.</p>";
    }
}

// Call the seeding function when the main.html page loads.
seedHikes();

showName();

showDashboard();