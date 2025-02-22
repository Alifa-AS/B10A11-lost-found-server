const express = require('express');
const cors = require('cors');
const jwt = require('jsonwebtoken');
const cookieParser = require('cookie-parser');
const app = express();
require('dotenv').config();
const port = process.env.PORT || 5000;
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');


//middleware
app.use(cors({
  origin: [
    'http://localhost:5173',
    'https://lost-found-client.web.app',
    'https://lost-found-client.firebaseapp.com'
  ],
  credentials: true
}));
app.use(express.json());
app.use(cookieParser());

const logger = (req, res, next) =>{
  // console.log('inside the logger');
  next();
}

//verify the token
const verifyToken = (req, res, next) =>{
  // console.log('inside verify token', req.cookies);
  const token = req?.cookies?.token;
  if(!token){
    return res.status(401).send({ message: ' UnAuthorized access '})
  }
  
  jwt.verify(token, process.env.ACCESS_TOKEN_SECRET, (err, decoded)=>{
    if(err){
      // console.log('Token verification error:', err);
      return res.status(401).send({ message: 'UnAuthorized access' })
    }
    req.user = decoded;
    next();
  })
}


const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.jhhpo.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0`;

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
    // Send a ping to confirm a successful connection
    // await client.db("admin").command({ ping: 1 });
    // console.log("Pinged your deployment. You successfully connected to MongoDB!");
  
   
    const itemsCollection = client.db('lostFound').collection('items');
    const recoverCollection = client.db('lostFound').collection('recover');

    //Auth related api
    app.post('/jwt', async(req,res)=>{
      const user = req.body;
      const token = jwt.sign(user, process.env.ACCESS_TOKEN_SECRET, {expiresIn: '10h'});
      res
      .cookie('token', token, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'strict'
      })
      .send({ success: true })
    })

    app.post('/logout', (req,res) => {
      res.clearCookie('token', {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'strict'
      })
      res.send({ success: true })
    })


    
     //lost and found related API's
  
    app.get('/items/all', async(req,res)=>{

      const sort = req.query?.sort;
      const search  = req.query?.search;
      const filter = req.query?.filter;

      let query = {};
      let sortQuery = {};
      // console.log("Before Processing Query:", req.query);


      if(sort == "true"){
        sortQuery = {"title" : 1 } 
      }

      if(search){
        query.location={$regex:search , $options: "i" };
      }
      // console.log(query);

      if(filter && filter !== "All"){
        query.category = filter;
      }
      // console.log("Final Query:", query);
      // console.log("Sorting:", sortQuery);

      const cursor = itemsCollection.find(query).sort(sortQuery);
      const result = await cursor.toArray();
      res.send(result);
    })


    app.get('/items',verifyToken, logger, async(req,res)=>{
      // console.log('now inside the api callback')

      const email = req.query.email;

      let query = {};
      // console.log("Before Processing Query:", req.query);

      if(email){
        query = { 'contact.email': email }

        if(req.user.email !== req.query.email){
          return res.status(403).send({message: 'forbidden access'})
        }
      }
      // console.log('cookies', req.cookies);

      const cursor = itemsCollection.find(query);
      const result = await cursor.toArray();
      res.send(result);
    })


    app.get('/items/:id', async(req,res)=>{
      const id = req.params.id;
      const query = { _id: new ObjectId(id)}
      const result = await itemsCollection.findOne(query);
      res.send(result);
    })

    app.post('/items', async(req,res) =>{
      const newPost = req.body;
      const result = await itemsCollection.insertOne(newPost);
      res.send(result);
    })

    //status update
    app.patch('/items/:id', async (req, res) => {
      try {
        const { id } = req.params;
        const { status } = req.body;
    
        if (!ObjectId.isValid(id)) {
          return res.status(400).json({ error: "Invalid Item ID" });
        }
    
        if (!status) {
          return res.status(400).json({ error: "Status is required" });
        }
    
        const result = await itemsCollection.updateOne(
          { _id: new ObjectId(id), status: { $ne: "recovered" } }, 
          { $set: { status: "recovered" } }
        );
    
        if (result.modifiedCount === 0) {
          return res.status(404).json({ error: "Item not found or already recovered" });
        }
    
        res.json({ success: true, message: "Item status updated to recovered" });
      } catch (error) {
        console.error("Error updating item status:", error);
        res.status(500).json({ error: "Failed to update item status" });
      }
    });
    


    //update
   app.put('/items/:id', async(req,res) =>{
    const id = req.params.id;
    const filter = {_id: new ObjectId(id)}
    const options = {upsert: true};
    const updatedItems = req.body;
    const item = {
      $set: {
          title: updatedItems.title,
          category: updatedItems.category,
          date: updatedItems.date,
          location: updatedItems.location,
          thumbnail: updatedItems.thumbnail,
          description: updatedItems.description,
          contact: updatedItems.contact,
          status: updatedItems.status,
      }
    }
    const result = await itemsCollection.updateOne(filter, item, options);
    res.send(result);
    // console.log(result)
   })

    //delete 
    app.delete('/items/:id', async(req,res) =>{
      const id = req.params.id;
      const query = {_id: new ObjectId(id)}
      const result = await itemsCollection.deleteOne(query);
      res.send(result);
    })


    //recover related apis
    app.get('/recover', async(req, res) => {
      const email = req.query.email;
      // console.log("Email received:", email); 
      if (!email) {
          return res.status(400).send({ error: "Email is required" });
      }
      const query = { "contact.email": email };
      const result = await recoverCollection.find(query).toArray();
      // console.log("Recovered data:", result);
      if (result.length === 0) {
          return res.status(404).send({ message: "No data found for this email" });
      }

      //data aggregate
      for(const application of result){
        // console.log(application._id)
        const query1 = {_id: new ObjectId(application._id)}
        const recovered = await recoverCollection.findOne(query1);
        // console.log('got recovered data',recovered)
        if(recovered){
          application.date = recovered.date;
          // console.log(recovered.date);
          application.location = recovered.location;
          // console.log(recovered.location);
          
        }
        // console.log("After update:", application); 
      }
      
      res.send(result);
    });
   
  

    app.post('/recover', async(req,res) =>{
      // console.log("Received data:", req.body);
      const { contact, ...recoverItems } = req.body;
      const {name, email } = contact;
      // console.log("Request Body:", req.body); 
      const recoverData = {
        ...recoverItems,
        contact: { 
          name: name || "Unknown",
          email: email || "No Email"
        }
      };
      const result = await recoverCollection.insertOne(recoverData);
      // console.log("Insert result:", result); 
      res.send(result);
      })
    


} finally {
    // Ensures that the client will close when you finish/error
    // await client.close();
  }
}
run().catch(console.dir);


app.get('/', (req,res) =>{
    res.send('lost & found portal running!')
})

app.listen(port, () =>{
    console.log(`Found your lost item: ${port}`)
})