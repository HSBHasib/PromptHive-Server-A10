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
    const userCollection = db.collection("user");
    const sessionCollection = db.collection("session");
    const promptCollection = db.collection("prompts");
    const reviewCollection = db.collection("reviews");
    const bookMarkCollection = db.collection("bookMarks");
    const reportCollection = db.collection("reports");
    const planCollection = db.collection("plan");
    const subcriptionCollection = db.collection("subcription");

    // ====================  Varifications  ====================
    const verifyToken = async (req, res, next) => {
      const authHeader = req.headers?.authorization;

      if (!authHeader) {
        return res.status(401).send({ message: "unauthorized access" });
      }

      // Access the token
      const token = authHeader.split(" ")[1];

      if (!token) {
        return res.status(401).send({ message: "unauthorized access" });
      }

      const query = { token: token };
      const session = await sessionCollection.findOne(query);
      if (!session) {
        return res.status(401).send({ message: "unauthorized access" });
      }

      const userId = session.userId;

      const userQuery = {
        _id: userId,
      };

      const user = await userCollection.findOne(userQuery);
      if (!user) {
        return res.status(401).send({ message: "unauthorized access" });
      }

      // Set data in the req object
      req.user = user;
      next();
    };

    // For Admin
    const verifyAdmin = async (req, res, next) => {
      if (req.user?.role !== "admin") {
        return res.status(403).json({ message: "forbidden access" });
      }
      next();
    };

    // For User
    const verifyUser = async (req, res, next) => {
      if (req.user?.role !== "user") {
        return res.status(403).json({ message: "forbidden access" });
      }
      next();
    };

    // For Creator
    const verifyCreator = async (req, res, next) => {
      if (req.user?.role !== "creator") {
        return res.status(403).json({ message: "forbidden access" });
      }
      next();
    };

    // For User & Creator
    const verifyUserOrCreator = (req, res, next) => {
      const allowedRoles = ["user", "creator"];
      if (!allowedRoles.includes(req.user?.role)) {
        return res.status(403).json({ message: "forbidden access" });
      }
      next();
    };

    // Verify Is Any auth user
    const verifyAnyValidRole = (req, res, next) => {
      const validRoles = ["admin", "user", "creator"];
      if (!validRoles.includes(req.user?.role)) {
        return res.status(403).json({ message: "forbidden access" });
      }
      next();
    };

    // ====================  users  ====================
    // Get All Users Data From MongoDB
    app.get("/api/users", async (req, res) => {
      try {
        const { userId, page, limit } = req.query;

        const query = {};

        if (userId) {
          query._id = new ObjectId(userId);
        }

        // --- Dynamic Pagination ---
        const pageNum = parseInt(page) || 1;
        const perPage = parseInt(limit) || 4;
        const skipItem = (pageNum - 1) * perPage;

        const cursor = userCollection
          .find(query)
          .sort({ createdAt: -1 })
          .skip(skipItem)
          .limit(perPage);

        const result = await cursor.toArray();

        // Total Count
        const totalUsers = await userCollection.countDocuments(query);

        res.status(200).send({
          success: true,
          total: totalUsers,
          perPage: perPage,
          data: result,
        });
      } catch (err) {
        res.status(500).send({
          success: false,
          message: "Failed to fetch users",
          error: err.message,
        });
      }
    });

    // Update User Data on MongoDB
    app.patch("/api/users/:id", verifyToken, verifyAdmin, async (req, res) => {
      try {
        const { id } = req.params;
        const user = req.body;

        if (!id) {
          return res
            .status(400)
            .send({ success: false, message: "Prompt ID is required" });
        }

        // Convert MongoDB Object ID
        const filter = { _id: new ObjectId(id) };

        // Set Updated Data
        const updatedDocument = {
          // $set: user,
          $set: {
            role: user.role,
          },
        };

        // Update data on mongoDB
        const result = await userCollection.updateOne(filter, updatedDocument);
        res.status(200).send(result);
      } catch (err) {
        res.status(500).send({
          success: false,
          message: "Failed to update prompt",
          error: err.message,
        });
      }
    });

    // Delete User Data From MongoDB
    app.delete("/api/users/:id", verifyToken, verifyAdmin, async (req, res) => {
      try {
        const { id } = req.params;

        // Check Is ID has or not
        if (!id) {
          return res
            .status(400)
            .send({ success: false, message: "User ID is required" });
        }

        // Convert MongoDB Object ID
        const filter = { _id: new ObjectId(id) };

        const result = await userCollection.deleteOne(filter);
        res.status(200).send({
          success: result.deletedCount > 0,
          message: "User deleted",
        });
      } catch (err) {
        res.status(500).send({
          success: false,
          message: "Failed to delete User",
          error: err.message,
        });
      }
    });

    // ====================  Prompts  ====================
    // // Get Top 6 Trending Prompts
    app.get("/api/trending-prompts", async (req, res) => {
      try {
        const result = await promptCollection
          .aggregate([
            {
              $lookup: {
                from: "reviews",
                let: { prompt_id_as_string: { $toString: "$_id" } },
                pipeline: [
                  {
                    $match: {
                      $expr: { $eq: ["$promptId", "$$prompt_id_as_string"] },
                    },
                  },
                ],
                as: "reviews",
              },
            },
            {
              $addFields: {
                averageRating: { $ifNull: [{ $avg: "$reviews.rating" }, 0] },
              },
            },
            { $sort: { averageRating: -1, copyCount: -1 } },
            { $limit: 6 },
            { $project: { reviews: 0 } },
          ])
          .toArray();

        res.status(200).send(result);
      } catch (err) {
        res.status(500).send({
          success: false,
          message: "Failed to fetch trending prompts",
          error: err.message,
        });
      }
    });

    // Get Prompts Data
    app.get("/api/prompts", async (req, res) => {
      try {
        const {
          userId,
          page,
          limit,
          search,
          category,
          aiTool,
          difficulty,
          sort,
        } = req.query;

        const query = {};
        if (userId) query.userId = userId;

        // Sort
        if (search) {
          query.$or = [
            { title: { $regex: search, $options: "i" } },
            { tags: { $regex: search, $options: "i" } },
            { aiTool: { $regex: search, $options: "i" } },
          ];
        }

        // Filter
        if (category && category !== "all")
          query.category = { $regex: category, $options: "i" };
        if (aiTool && aiTool !== "all")
          query.aiTool = { $regex: aiTool, $options: "i" };
        if (difficulty && difficulty !== "all")
          query.difficulty = { $regex: difficulty, $options: "i" };

        // Pagination
        const pageNum = parseInt(page) || 1;
        const perPage = parseInt(limit) || 9;
        const skipItem = (pageNum - 1) * perPage;

        const result = await promptCollection
          .aggregate([
            { $match: query },
            {
              $lookup: {
                from: "reviews",
                let: { prompt_id_as_string: { $toString: "$_id" } },
                pipeline: [
                  {
                    $match: {
                      $expr: {
                        $eq: ["$promptId", "$$prompt_id_as_string"],
                      },
                    },
                  },
                ],
                as: "reviews",
              },
            },
            {
              $addFields: {
                averageRating: { $ifNull: [{ $avg: "$reviews.rating" }, 0] },
                totalReviews: { $size: "$reviews" },
              },
            },

            // Sort Logic
            {
              $sort:
                sort === "popular"
                  ? { averageRating: -1 }
                  : sort === "copied"
                    ? { copyCount: -1 }
                    : { createdAt: -1 },
            },
            { $skip: skipItem },
            { $limit: perPage },
            { $project: { reviews: 0 } },
          ])
          .toArray();

        // Total Prompts
        const totalPrompts = await promptCollection.countDocuments(query);

        // Count Total Copies and BookMarks
        const totalCopiesResult = await promptCollection
          .aggregate([
            { $match: query },
            {
              $group: {
                _id: null,
                totalCopies: { $sum: "$copyCount" },
                totalBookmarks: { $sum: "$bookMark" },
              },
            },
          ])
          .toArray();

        const totalCopies =
          totalCopiesResult.length > 0 ? totalCopiesResult[0].totalCopies : 0;

        const totalBookM =
          totalCopiesResult.length > 0
            ? totalCopiesResult[0].totalBookmarks
            : 0;

        res.status(200).send({
          success: true,
          total: totalPrompts,
          totalCopies,
          totalBookMarks: totalBookM,
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
    app.post(
      "/api/prompts",
      verifyToken,
      verifyUserOrCreator,
      async (req, res) => {
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
      },
    );

    // Update Prompt Data
    app.patch(
      "/api/my-prompt/:id",
      verifyToken,
      verifyUserOrCreator,
      async (req, res) => {
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
      },
    );

    // Update Prompt CopyCount
    app.patch(
      "/api/prompts/copy-count/:id",
      verifyToken,
      verifyAnyValidRole,
      async (req, res) => {
        try {
          const { id } = req.params;
          const result = await promptCollection.updateOne(
            { _id: new ObjectId(id) },
            { $inc: { copyCount: 1 } },
          );
          res.status(200).send(result);
        } catch (err) {
          res
            .status(500)
            .send({ success: false, message: "Failed to update copy count" });
        }
      },
    );

    // Delete Prompt Data
    app.delete(
      "/api/my-prompt/:id",
      verifyToken,
      verifyAnyValidRole,
      async (req, res) => {
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
      },
    );

    // ====================  Reviews  ====================
    // Get Reviews Data From MongoDB
    app.get("/api/reviews", async (req, res) => {
      try {
        const { promptId, userId } = req.query;

        let query = {};
        if (promptId) {
          query.promptId = promptId;
        } else if (userId) {
          query.userId = userId;
        }

        const reviews = await reviewCollection
          .find(query)
          .sort({ createdAt: -1 })
          .limit(promptId ? 3 : 0)
          .toArray();

        const count = await reviewCollection.countDocuments(query);

        res.status(200).send({ reviews, totalReview: count });
      } catch (err) {
        res
          .status(500)
          .send({ success: false, message: "Failed to fetch reviews" });
      }
    });

    // Insert Review Data on MongoDB
    app.post(
      "/api/reviews",
      verifyToken,
      verifyAnyValidRole,
      async (req, res) => {
        try {
          const reviewData = req.body;
          const review = {
            ...reviewData,
            createdAt: new Date(),
          };

          const result = await reviewCollection.insertOne(review);
          res.status(201).send({ success: true, result });
        } catch (err) {
          res.status(500).send({
            success: false,
            message: "Failed to post review",
            error: err.message,
          });
        }
      },
    );

    // ==================== BookMarks ====================
    // Get Bookmarks Data
    app.get("/api/bookmarks", async (req, res) => {
      try {
        const { userId } = req.query;
        let query = {};

        if (userId) {
          query = { userId: userId };
        }

        const result = await bookMarkCollection.find(query).toArray();
        res.status(200).send({ success: true, data: result });
      } catch (err) {
        res
          .status(500)
          .send({ success: false, message: "Failed to fetch bookmarks" });
      }
    });

    // Insert BookMarks Data and Delete and Update Prompts BookMarks Data
    app.post("/api/bookmarks", async (req, res) => {
      try {
        const { promptId, userId } = req.body;

        const isExits = await bookMarkCollection.findOne({ promptId, userId });

        if (isExits) {
          await bookMarkCollection.deleteOne({ _id: isExits._id });
          await promptCollection.updateOne(
            { _id: new ObjectId(promptId) },
            { $inc: { bookMark: -1 } },
          );
          res.status(200).send({ status: "removed" });
        } else {
          await bookMarkCollection.insertOne({
            promptId,
            userId,
            createdAt: new Date(),
          });
          await promptCollection.updateOne(
            { _id: new ObjectId(promptId) },
            { $inc: { bookMark: 1 } },
          );
          res.status(200).send({ status: "added" });
        }
      } catch (err) {
        res.status(500).send({
          success: false,
          message: "Bookmark action failed",
          error: err.message,
        });
      }
    });

    // ==================== Reports ====================
    // Get Reported Data From MongoDB
    app.get("/api/reports", verifyToken, verifyAdmin, async (req, res) => {
      try {
        const result = await reportCollection.find().toArray();
        res.status(200).send(result);
      } catch (err) {
        res
          .status(500)
          .send({ success: false, message: "Failed to fetch Reported Data" });
      }
    });

    // Insert Report Data on MongoDB
    app.post(
      "/api/reports",
      verifyToken,
      verifyUserOrCreator,
      async (req, res) => {
        try {
          const { promptId, userId, reason, details } = req.body;
          const newReport = {
            promptId,
            userId,
            reason,
            details,
            createdAt: new Date(),
          };
          const result = await reportCollection.insertOne(newReport);
          res.status(201).send(result);
        } catch (err) {
          res
            .status(500)
            .send({ success: false, message: "Failed to submit report" });
        }
      },
    );

    // Delete Reported Data From MongoDB
    app.delete(
      "/api/reports/:id",
      verifyToken,
      verifyAdmin,
      async (req, res) => {
        try {
          const { id } = req.params;

          const result = await reportCollection.deleteOne({
            _id: new ObjectId(id),
          });

          res.send(result);
        } catch (err) {
          res.status(500).send({
            success: false,
            message: "Failed to delete report",
            error: err.message,
          });
        }
      },
    );

    // ==================== Plans ====================
    app.get(
      "/api/plans",
      verifyToken,
      verifyUserOrCreator,
      async (req, res) => {
        try {
          const query = {};

          if (req.query.plan) {
            query.plan = req.query.plan;
          }

          const plans = await planCollection.find(query).toArray();

          res.status(200).send(plans);
        } catch (error) {
          res.status(500).send({ message: "Failed to fetch plans" });
        }
      },
    );

    //==================== Subcription ====================
    // Get Subcriptions Data from MongoDB
    app.get("/api/subcriptions", verifyToken, verifyAdmin, async (req, res) => {
      try {
        const result = await subcriptionCollection
          .find({})
          .sort({ createdAt: -1 })
          .toArray();

        res.status(200).json(result);
      } catch (error) {
        console.error("Fetch Subscription Error:", error);
        res.status(500).json({
          message: "Failed to fetch subscriptions",
          error: error.message,
        });
      }
    });

    // Insert Subcriptions Data on MongoDB
    app.post("/api/subcriptions", verifyToken, async (req, res) => {
      try {
        const data = req.body;

        if (!data.billingEmail || !data.plan) {
          return res
            .status(400)
            .json({ message: "User ID and Plan are required" });
        }

        // Insert Subcription Data
        const result = await subcriptionCollection.insertOne(data);

        // Match userId for update user plan data
        const filter = { email: data.billingEmail };
        const updateDocument = {
          $set: {
            plan: data.plan,
          },
        };

        const updateUser = await userCollection.updateOne(
          filter,
          updateDocument,
        );

        res.status(200).json({
          subcribtion: result,
          updateUser,
        });
      } catch (error) {
        if (error.name === "BSONTypeError") {
          return res.status(400).json({ message: "Invalid User ID format" });
        }

        res.status(500).json({
          message: "Internal Server Error",
          error: error.message,
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
