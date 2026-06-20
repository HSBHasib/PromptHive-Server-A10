const express = require("express");
const cors = require("cors");
const dotenv = require("dotenv");

// Load environment variables
dotenv.config();

const app = express();
const PORT = process.env.PORT || 8000;

// Middlewares
app.use(express.json());
app.use(cors());

const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");
const uri = process.env.MONGODB_URI;

// Create a MongoClient with a MongoClientOptions object to set the Stable API version
const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});

async function run() {
  try {
    // Connect the client to the server	(optional starting in v4.7)
    await client.connect();

    // Connect to DB
    const db = client.db(process.env.DB_NAME);

    // Create or Access to DB Collections
    const promptCollection = db.collection("prompts");
    const userCollection = db.collection("user");

    // ====================  users  ====================
    // Get All Users Data From MongoDB
    app.get("/api/users", async (req, res) => {
      try {
        const { id } = req.query;

        const query = {};

        if (id) {
          query._id = new ObjectId(id);
        }

        const cursor = userCollection.find(query);
        const result = await cursor.toArray();

        res.status(200).send(result);
      } catch (err) {
        res.status(500).send({
          success: false,
          message: "Failed to fetch users data",
          error: err.message,
        });
      }
    });

    // ====================  Prompts  ====================

    // Get Top 6 Trending Prompts
    app.get("/api/trending-prompts", async (req, res) => {
      try {
        const result = await promptCollection
          .find({})
          .sort({ rating: -1, copyCount: -1 })
          .limit(6)
          .toArray();

        res.status(200).send(result);
      } catch (err) {
        res.status(500).send({
          success: false,
          message: "Failed to fetch landing page prompts",
          error: err.message,
        });
      }
    });

    // Get Prompts Data
    app.get("/api/prompts", async (req, res) => {
      try {
        const { userId, page, limit, search, category, aiTool, difficulty } =
          req.query;

        const query = {};

        // Access UserId
        if (userId) {
          query.userId = userId;
        }

        // Find Data Based on Search Input
        if (search) {
          query.$or = [
            { title: { $regex: search, $options: "i" } },
            { tags: { $regex: search, $options: "i" } },
            { aiTool: { $regex: search, $options: "i" } },
          ];
        }

        // Find Data Based on Category
        if (category) {
          query.category = category;
        }

        if (aiTool) {
          query.aiTool = aiTool;
        }

        if (difficulty) {
          query.difficulty = difficulty;
        }

        // --- Dynamic Pagination ---
        const pageNum = parseInt(page) || 1;
        const perPage = parseInt(limit) || 9;
        const skipItem = (pageNum - 1) * perPage;

        // Find Data Based On Condition
        const cursor = promptCollection
          .find(query)
          .sort({ createdAt: -1 })
          .skip(skipItem)
          .limit(perPage);

        const result = await cursor.toArray();

        // Total Prompts
        const totalPrompts = await promptCollection.countDocuments(query);

        res.status(200).send({
          success: true,
          total: totalPrompts,
          perPage: perPage,
          data: result,
        });
      } catch (err) {
        res.status(500).send({
          success: false,
          message: "Failed to fetch prompts",
          error: err.message,
        });
      }
    });

    // Insert New Created Prompt Data on 'MongoDB'
    app.post("/api/prompts", async (req, res) => {
      try {
        const prompt = req.body;

        const promptData = {
          ...prompt,
          createdAt: new Date(),
        };

        const result = await promptCollection.insertOne(promptData);
        res.status(201).send(result);
      } catch (err) {
        res.status(500).send({
          success: false,
          message: "Internal Server Error. Something went wrong!",
          error: err.message,
        });
      }
    });

    // Update Prompt Data
    app.patch("/api/my-prompt/:id", async (req, res) => {
      try {
        const { id } = req.params;
        const { ...updatedPrompt } = req.body;

        if (!id) {
          return res
            .status(400)
            .send({ success: false, message: "Prompt ID is required" });
        }

        // Convert MongoDB Object ID
        const filter = { _id: new ObjectId(id) };

        // Set Updated Data
        const updatedDocument = {
          $set: updatedPrompt,
        };

        // Update data on mongoDB
        const result = await promptCollection.updateOne(
          filter,
          updatedDocument,
        );
        res.status(200).send(result);
      } catch (err) {
        res.status(500).send({
          success: false,
          message: "Failed to update prompt",
          error: err.message,
        });
      }
    });

    // Delete Prompt Data
    app.delete("/api/my-prompt/:id", async (req, res) => {
      try {
        const { id } = req.params;

        // Check Is ID has or not
        if (!id) {
          return res
            .status(400)
            .send({ success: false, message: "Prompt ID is required" });
        }

        // Convert MongoDB Object ID
        const filter = { _id: new ObjectId(id) };

        const result = await promptCollection.deleteOne(filter);
        res.status(200).send(result);
      } catch (err) {
        res.status(500).send({
          success: false,
          message: "Failed to delete prompt",
          error: err.message,
        });
      }
    });

    await client.db("admin").command({ ping: 1 });
    console.log(
      "Pinged your deployment. You successfully connected to MongoDB!",
    );
  } finally {
    // Ensures that the client will close when you finish/error
    // await client.close();
  }
}
run().catch(console.dir);

// Base Health Check Route
app.get("/", (req, res) => {
  res.send("Backend server is running successfully!");
});

// Start the server
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
