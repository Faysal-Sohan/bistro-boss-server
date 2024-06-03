const express = require('express');
const app = express();
const cors = require('cors');
const jwt = require('jsonwebtoken');
require('dotenv').config()
const stripe = require("stripe")(process.env.STRIPE_SECRET_KEY);
const port = process.env.PORT || 5000;

// middleware
const corsConfig = {
  origin: 'https://illustrious-babka-86649c.netlify.app', // Replace with your frontend origin
  optionsSuccessStatus: 200, // Some legacy browsers expect this
};
app.use(cors(corsConfig));
app.use(express.json());


const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
const uri = `mongodb+srv://${process.env.db_user}:${process.env.db_pass}@cluster0.otdrvkn.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0`;

// Create a MongoClient with a MongoClientOptions object to set the Stable API version
const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  }
});

async function run() {
  try {
    // Connect the client to the server	(optional starting in v4.7)
    // await client.connect();

    const userCollection = client.db("bistroBossDB").collection("users");
    const menuCollection = client.db("bistroBossDB").collection("menu");
    const reviewCollection = client.db("bistroBossDB").collection("reviews");
    const cartCollection = client.db("bistroBossDB").collection("carts");
    const paymentCollection = client.db("bistroBossDB").collection("payments");

    // middlewares
    const verifyToken = async (req, res, next) => {
      // getting the token
      // console.log("inside verify token", req.headers.authorization)
      if (!req.headers.authorization) {
        return res.status(401).send({ message: 'Unauthorized access' });
      }
      const token = req.headers.authorization.split(' ')[1]
      jwt.verify(token, process.env.ACCESS_TOKEN_SECRET, (err, decoded) => {
        if (err) {
          return res.status(401).send({ message: "Unauthorized access" })
        }
        req.decoded = decoded;
        next();
      })
    }

    const verifyAdmin = async (req, res, next) => {
      const email = req.decoded.email;
      const query = { email: email };
      const user = await userCollection.findOne(query);
      const isAdmin = user?.role === 'admin';
      if (!isAdmin) {
        return res.status(403).send({ message: "Forbidden access" });
      }
      next();
    }

    // create token after user login
    app.post('/jwt', async (req, res) => {
      const user = req.body;
      const token = jwt.sign(user, process.env.ACCESS_TOKEN_SECRET, { expiresIn: '1h' })
      res.send({ token })
    })
    // menu related apis
    app.get('/menu', async (req, res) => {
      const result = await menuCollection.find().toArray();
      res.send(result);
    })

    app.get('/menu/:id', async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const result = await menuCollection.findOne(query);
      res.send(result);
    })

    app.post('/menu', verifyToken, verifyAdmin, async (req, res) => {
      const item = req.body;
      const result = await menuCollection.insertOne(item);
      res.send(result);
    })

    app.patch('/menu/:id', verifyToken, verifyAdmin, async (req, res) => {
      const id = req.params.id;
      const updatedItem = {
        $set: req.body
      };
      const query = { _id: new ObjectId(id) };
      const result = await menuCollection.updateOne(query, updatedItem);
      res.send(result);
    })

    app.delete('/menu/:id', verifyToken, verifyAdmin, async (req, res) => {
      const id = req.params.id;
      const filter = { _id: new ObjectId(id) };
      const result = await menuCollection.deleteOne(filter);
      res.send(result);
    })

    app.get('/reviews', async (req, res) => {
      const result = await reviewCollection.find().toArray();
      res.send(result);
    })

    // users entry in database
    app.get('/users', verifyToken, verifyAdmin, async (req, res) => {
      const data = await userCollection.find().toArray();
      res.send(data)
    })

    app.get('/users/admin/:email', verifyToken, async (req, res) => {
      const email = req.params.email;
      const query = { email: email };
      const user = await userCollection.findOne(query);
      let admin = false;
      if (user) {
        admin = user?.role === 'admin';
      }
      res.send({ admin });
    })

    app.patch('/users/admin/:id', verifyToken, verifyAdmin, async (req, res) => {
      const id = req.params.id;
      const filter = { _id: new ObjectId(id) };
      const updateDoc = {
        $set: {
          role: 'admin'
        }
      };
      const result = await userCollection.updateOne(filter, updateDoc);
      res.send(result);
    })

    app.delete('/users/:id', verifyToken, verifyAdmin, async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const result = await userCollection.deleteOne(query);
      res.send(result);
    })

    app.post('/users', async (req, res) => {
      user = req.body;
      // insert user if it doesnt exist
      const query = { email: user.email }
      const existUser = await userCollection.findOne(query)
      if (existUser) {
        return res.send({ message: 'User already exists', insertedId: null })
      }
      const result = await userCollection.insertOne(user)
      res.send(result)
    })

    // carts collection
    app.get('/carts', async (req, res) => {
      const email = req.query.email;
      const query = { email: email };
      const result = await cartCollection.find(query).toArray();
      res.send(result);
    });

    app.post('/carts', async (req, res) => {
      const cartItem = req.body;
      const result = await cartCollection.insertOne(cartItem);
      res.send(result);
    });

    app.delete('/carts/:id', async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) }
      const result = await cartCollection.deleteOne(query);
      res.send(result);
    })

    // payments related apis

    app.get('/paymentHistory/:email', verifyToken, async (req, res) => {
      const email = req.params.email;
      if (email !== req.decoded.email) {
        return res.status(403).send({ message: "Forbidden access" })
      }
      const query = { user: email };
      const result = await paymentCollection.find(query).toArray();
      res.send(result);
    })

    app.post('/create-payment-intent', async (req, res) => {
      const { price } = req.body;
      const amount = parseInt(price * 100);

      // console.log(amount, 'inside amount api')

      const paymentIntent = await stripe.paymentIntents.create({
        amount: amount,
        currency: 'usd',
        payment_method_types: ['card']
      });

      app.post('/payment', async (req, res) => {

        const paymentInfo = req.body;

        // add payment info to database
        const paymentRes = await paymentCollection.insertOne(paymentInfo);

        // delete items from cart which are paid
        const filter = {
          _id: {
            $in: paymentInfo.cartItemIds.map(id => new ObjectId(id))
          }
        }
        const deleteRes = await cartCollection.deleteMany(filter);
        res.send([paymentRes, deleteRes])
      });

      res.send({
        clientSecret: paymentIntent.client_secret,
      });
    });

    // admin stats
    app.get('/admin-stats', verifyToken, verifyAdmin, async (req, res) => {
      const users = await userCollection.estimatedDocumentCount();
      const menuItems = await menuCollection.estimatedDocumentCount();
      const orders = await paymentCollection.estimatedDocumentCount();
      const result = await paymentCollection.aggregate([
        {
          $group: { _id: null, totalAmount: { $sum: "$totalAmount" } }
        }
      ]).toArray();

      const revenue = result.length > 0 ? result[0].totalAmount : 0;

      res.send({
        users,
        menuItems,
        orders,
        revenue
      })
    });

    // order-stats
    app.get('/order-stats', async (req, res) => {
      const result = await paymentCollection.aggregate([
        {
          $set: {
            menuItemIds: {
              $map: {
                input: "$menuItemIds", as: "item", in: { $toObjectId: "$$item" }
              }
            }
          }
        },
        {
          $unwind: "$menuItemIds"
        },
        {
          $lookup: {
            from: 'menu',
            localField: 'menuItemIds',
            foreignField: '_id',
            as: 'menuItems'
          }
        },
        {
          $unwind: '$menuItems'
        },
        {
          $group: {
            _id: '$menuItems.category',
            quantity: { $sum: 1 },
            revenue: { $sum: '$menuItems.price' }
          },
        },
        {
          $project: {
            _id: 0,
            category: '$_id',
            quantity: '$quantity',
            revenue: '$revenue'
          }
        }
      ]).toArray();

      res.send(result)
    })

    // Send a ping to confirm a successful connection
    // await client.db("admin").command({ ping: 1 });
    // console.log("Pinged your deployment. You successfully connected to MongoDB!");
  } finally {
    // Ensures that the client will close when you finish/error
    // await client.close();
  }
}
run().catch(console.dir);


app.get('/', (req, res) => {
  res.send('boss is sitting')
})

app.listen(port, () => {
  console.log(`Bistro boss is sitting on port ${port}`);
})

/**
 * --------------------------------
 *      NAMING CONVENTION
 * --------------------------------
 * app.get('/users')
 * app.get('/users/:id')
 * app.post('/users')
 * app.put('/users/:id')
 * app.patch('/users/:id')
 * app.delete('/users/:id')
 * 
*/