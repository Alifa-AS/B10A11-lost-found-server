const express = require('express');
const cors = require('cors');
const app = express();
require('dotenv').config();
const port = process.env.PORT || 5000;
const { MongoClient, ServerApiVersion, ObjectId, ReadConcernLevel } = require('mongodb');


//middleware
app.use(cors());
app.use(express.json());


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
    await client.connect();
    // Send a ping to confirm a successful connection
    await client.db("admin").command({ ping: 1 });
    console.log("Pinged your deployment. You successfully connected to MongoDB!");
  
   
    const itemsCollection = client.db('lostFound').collection('items');
    const recoverCollection = client.db('lostFound').collection('recover');


     //lost and found related API's
    app.get('/items', async(req,res)=>{
      const email = req.query.email;
      let query = {};
      if(email){
        query = { 'contact.email': email }
      }
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
      console.log("Email received:", email); 
  
      if (!email) {
          return res.status(400).send({ error: "Email is required" });
      }
      const query = { "contact.email": email };
      const result = await recoverCollection.find(query).toArray();
      console.log("Recovered data:", result);
      if (result.length === 0) {
          return res.status(404).send({ message: "No data found for this email" });
      }

      //data aggregate
      for(const application of result){
        console.log(application.item_id)
        const query1 = {_id: new ObjectId(application.item_id)}
        const recovered = await itemsCollection.findOne(query1);
        if(recovered){
          application.title = recovered.title;
          application.location = recovered.location;
          application.category = recovered.category;
        }
      }

      res.send(result);
  });
  

    app.post('/recover', async(req,res) =>{
      console.log("Received data:", req.body);
      const { contact, ...recoverItems } = req.body;
      const {name, email } = contact;
      console.log("Request Body:", req.body); 
      const recoverData = {
        ...recoverItems,
        contact: { 
          name: name || "Unknown",
          email: email || "No Email"
        }
      };
      const result = await recoverCollection.insertOne(recoverData);
      console.log("Insert result:", result); 
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