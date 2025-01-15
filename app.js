const express = require('express')
const cors = require('cors')
const {v4:uuidv4} = require('uuid')
const {MongoClient} = require('mongodb')
const jwt = require('jsonwebtoken')
const bcrypt = require('bcrypt')
const app = express()
require('dotenv').config(); 
app.use(express.json())
app.use(cors())

let client 
const initializeDBAndServer = async() => {
    const {DB_USER, DB_PASSWORD, DB_CLUSTER, DB_NAME, PORT} = process.env
    const uri = `mongodb+srv://${DB_USER}:${DB_PASSWORD}@${DB_CLUSTER}/${DB_NAME}?retryWrites=true&w=majority&appName=Cluster0`
    client = new MongoClient(uri)

    try{
        await client.connect()
        console.log("Successfully connected to MongoDB")

        const port = PORT || 3000
        app.listen(port, () => {
            console.log(`Server Running on port: ${port}`)
        })
    }
    catch(e){
        console.log(`DB Error: ${e.message}`)
        process.exit(1)
    }
}

initializeDBAndServer()

// Middleware Function

const authenticateToken = (request, response, next) => {
    let jwtToken

    const authHeader = request.headers["authorization"]

    if(authHeader !== undefined){
        jwtToken = authHeader.split(" ")[1]
    }
    
    if(authHeader === undefined){
        response.status(400).send({message: "Invalid JWT Token"})
    }
    else{
        jwt.verify(jwtToken, process.env.JWT_SECRET, async(error, payload) => {
            if(error){
                response.status(400).send({message: error})
            }
            else{
                request.userId = payload.userId
                next()
            }
        })
    }
}

// API - 1 User Registration

app.post('/register', async(request, response) => {
    const {username, email, password} = request.body
    const userCollection = client.db(process.env.DB_NAME).collection('users')
    const checkUserInDB = await userCollection.find({email}).toArray()

    try{
        if(checkUserInDB.length === 0){
                const hashedPassword = await bcrypt.hash(password, 10)
    
                if(username !== undefined && email !== undefined && password !== undefined){
                    const userDetails = {
                        userId: uuidv4(),
                        userName: username,
                        email: email,
                        password: hashedPassword,
                        accountBalance: 0
                    }
    
                    await userCollection.insertOne(userDetails)
                    response.status(201).send({message: "User Registered Successfully"})
                }
                else{
                    response.status(401).send({message: "Please Enter Valid User Details"})
                }
            }
        else{
            response.status(401).send({message: "User Already Exists"})
        }
    }
    catch(e){
        response.status(500).send({message: "Internal Server Error"})
    }
})

// API - 2 User Login

app.post('/login', async(request, response) => {
    const {email, password} = request.body
    const userCollection = client.db(process.env.DB_NAME).collection('users')

    const checkUserInDB = await userCollection.find({email: email}).toArray()

    try{
        if(checkUserInDB.length === 1){
            const verifyPassword = await bcrypt.compare(password, checkUserInDB[0].password)
    
            if(verifyPassword){
                const token = jwt.sign({userId: checkUserInDB[0].userId}, 'MY_SECRET_TOKEN')
                response.status(201).send({userId: checkUserInDB[0].userId, jwtToken: token, username: checkUserInDB[0].username})
            }
            else{
                response.status(401).send({message: "Incorrect Password"})
            }
        }
        else{
            response.status(401).send({message: "User Doesn't Exist"})
        }
    }
    catch(e){
        response.status(500).send({message: "Internal Server Error"})
    }
})

// API - 3 Create New Invoice By Using POST Method

app.post('/invoices', authenticateToken, async(request, response) => {
    const {userId} = request
    const {clientName, amount, status} = request.body

    const userCollection = client.db(process.env.DB_NAME).collection('users') // user table
    const invoiceCollection = client.db(process.env.DB_NAME).collection('invoiceData') // Invoices Table
    const findUser = await userCollection.findOne({userId: userId})

    try{
        if(findUser !== null){
            const newInvoice = {
                invoiceNum: uuidv4(),
                clientName: clientName,
                date: new Date(),
                amount: amount,
                status: status
            }

            await invoiceCollection.insertOne(newInvoice)
            response.status(200).send({message: "New Invoice, has been added successfully"})
        }
        else{
            response.status(400).send({message: "Invalid User Request"})
        }
    }
    catch(e){
        response.status(500).send({message: "Internal Server Error"})
    }
})

// API - 4 GET All Invoices of a User using GET Method

app.get('/invoices', authenticateToken, async(request, response) => {
    const {userId} = request
    const userCollection = client.db(process.env.DB_NAME).collection('users') // user table
    const invoiceCollection = client.db(process.env.DB_NAME).collection('invoiceData') // Invoices Table
    const findUser = await userCollection.findOne({userId: userId})

    try{
        if(findUser !== null){
            const getUserInvoices = await invoiceCollection.find({userId: userId}).toArray()
            if(getUserInvoices.length > 0){
                response.status(200).send(getUserInvoices)
            }
            else{
                response.status(200).send({message: "No Invoice Data Found"})
            }
        }
        else{
            response.status(400).send({message: "Invalid User Request"})
        }
    }
    catch(e){
        response.status(500).send({message: "Internal Server Error"})
    }
})

// API - 5 Update Invoice Details using Invoice Number and PUT Method

app.put('/invoices/:id', authenticateToken, async(request, response) => {
    const {userId} = request
    const {status} = request.body

    const userCollection = client.db(process.env.DB_NAME).collection('users') // user table
    const invoiceCollection = client.db(process.env.DB_NAME).collection('invoiceData') // Invoices Table
    const findUser = await userCollection.findOne({userId: userId})

    try{
        if(findUser !== null){
            const findInvoice = request.params
            const checkInvoiceNum = await invoiceCollection.findOne({invoiceNum: findInvoice})

            if(checkInvoiceNum !== null){
                await invoiceCollection.updateOne({invoiceNum: findInvoice}, {$set: {status: status}})
                response.status(200).send({message: "Invoice Status Updated Successfully"})
            }
            else{
                response.status(400).send({message: "Invalid Invoice Details"})
            }
        }
        else{
            response.status(400).send({message: "Invalid User Request"})
        }
    }
    catch(e){
        response.status(500).send({message: "Internal Server Error"})
    }

})

// API - 6 Delete Invoice Details using Invoice Number and DELETE Method

app.delete('/invoices/:id', authenticateToken, async(request, response) => {
    const {userId} = request
    const userCollection = client.db(process.env.DB_NAME).collection('users') // user table
    const invoiceCollection = client.db(process.env.DB_NAME).collection('invoiceData') // Invoices Table
    const findUser = await userCollection.findOne({userId: userId})

    try{
        if(findUser !== null){
            const findInvoice = request.params
            const checkInvoiceNum = await invoiceCollection.findOne({invoiceNum: findInvoice})

            if(checkInvoiceNum !== null){
                await invoiceCollection.deleteOne({invoiceNum: findInvoice})
                response.status(200).send({message: "Invoice Details Deleted Successfully"})
            }
            else{
                response.status(400).send({message: "Invalid Invoice Details"})
            }
        }
        else{
            response.status(400).send({message: "Invalid User Request"})
        }
    }
    catch(e){
        response.status(500).send({message: "Internal Server Error"})
    }
})