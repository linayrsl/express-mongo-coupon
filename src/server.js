const express = require("express");
const MongoClient = require("mongodb").MongoClient;
const bodyParser = require("body-parser");
const app = express();
const cors = require("cors");
const HttpStatus = require("http-status-codes");
const ObjectId = require("mongodb").ObjectID;
const Ajv = require("ajv");

const port = 3000;

app.use(cors());

app.use(bodyParser.urlencoded({extended: false}));

app.use(bodyParser.json());

let db;
const client = new MongoClient("mongodb://localhost:27017" , {useUnifiedTopology: true});
client.connect((error) => {
    if (error) {
        console.log(error);
        return;
    }
    db = client.db( "app");
    console.log("Successful connection to DB");
});


// Defining validation schema to disallow incorrect and malicious input
const couponValidationSchema = {
    type: "object",
    properties: {
        // Any change to properties will affect couponUpdateValidationSchema
        code: {type: "number", minimum: 10000, maximum: 9999999},
        date: {type: "string", pattern: "^([0-9]{2}/[0-9]{2}/[0-9]{4})$"},
        isRedeem: {type: "boolean"},
        updatedAt: {type: "string"}
    },
    required: ["code", "date", "isRedeem"],
    additionalProperties: false
};

// This is a shallow copy, so all properties are shared between two schemas
const updateCouponValidation =
    { ...couponValidationSchema, required: ["updatedAt"] }

// Instantiating JsonSchema validator
const ajv = new Ajv();
const couponValidator = ajv.compile(couponValidationSchema);

app.put("/coupon", (req, res) => {
    const isCouponValid = couponValidator(req.body);
    if (!isCouponValid) {
        res.status(HttpStatus.BAD_REQUEST).json({errors: couponValidator.errors});
        return;
    }
    db.collection("coupons").findOne({code: req.body.code})
        .then((coupon) => {
            if (coupon) {
                return Promise.reject(HttpStatus.CONFLICT)
            } else {
                // Setting initial updatedAt timestamp for coupon object
                req.body["updatedAt"] =  new Date().toISOString();
                // Returning new promise in case no conflict with existing coupon
                return db.collection("coupons").insertOne(req.body)
            }
        })
        .then((response) => {
            res.status(HttpStatus.CREATED).json(response.ops[0]);
        })
        .catch((error) => {
            if (error === HttpStatus.CONFLICT) {
                res.sendStatus(HttpStatus.CONFLICT);
            } else {
                res.sendStatus(HttpStatus.INTERNAL_SERVER_ERROR);
            }
        });
});

app.get("/coupon", (req, res) => {
    db.collection("coupons").find().toArray()
        .then((users) => {
            res.status(HttpStatus.OK).json(users);
        })
        .catch((error) => {
            res.sendStatus(HttpStatus.INTERNAL_SERVER_ERROR);
        })
});

app.get("/coupon/:id", (req, res) => {
    db.collection("coupons").findOne({_id: ObjectId(req.params.id)})
        .then((coupon) => {
            if (!coupon) {
                res.sendStatus(HttpStatus.NOT_FOUND);
                return;
            }
            res.status(HttpStatus.OK).json(coupon);
        })
       .catch((error) => {
           res.sendStatus(HttpStatus.INTERNAL_SERVER_ERROR);
       })
});

// Instantiating JsonSchema validator
const partialCouponValidator = ajv.compile(updateCouponValidation)

app.post("/coupon/:id", (req, res) => {
    const isCouponUpdateValid = partialCouponValidator(req.body);
    if (!isCouponUpdateValid) {
        res.status(HttpStatus.BAD_REQUEST).json({errors: partialCouponValidator.errors});
        return;
    }
    // Find coupon in db to check for correct updatedAt timestamp to prevent concurrent updates
    db.collection("coupons").findOne({_id: ObjectId(req.params.id)})
        .then((coupon) => {
            if (!coupon) {
                return Promise.reject(HttpStatus.NOT_FOUND);
            }
            if (coupon.updatedAt === req.body.updatedAt) {
                // Updating coupon only if correct updatedAt timestamp which means that no one changed the coupon before
                return db.collection("coupons").updateOne(
                    {_id: ObjectId(req.params.id)},
                    {$set: {
                        ...req.body,
                        // Setting new timestamp for coupon on update
                        updatedAt: new Date().toISOString()}});
            }
            return Promise.reject(HttpStatus.CONFLICT);
        })
        .then((response) => {
            if (response.modifiedCount === 0) {
                return Promise.reject(HttpStatus.NOT_FOUND);
            }
            res.sendStatus(HttpStatus.OK);
        })
        .catch((error) => {
            if (error === HttpStatus.NOT_FOUND) {
                res.sendStatus(HttpStatus.NOT_FOUND);
                return;
            }
            if (error === HttpStatus.CONFLICT) {
                res.sendStatus(HttpStatus.CONFLICT);
                return;
            }
            res.sendStatus(HttpStatus.INTERNAL_SERVER_ERROR);
        })
});

app.delete("/coupon/:id", (req, res) => {
    db.collection("coupons").findOneAndDelete({_id: ObjectId(req.params.id)})
        .then((response) => {
            if (response.value === null) {
                return Promise.reject(HttpStatus.NOT_FOUND);
            }
            res.sendStatus(HttpStatus.OK);
        })
        .catch((error) => {
            if (error === HttpStatus.NOT_FOUND) {
                res.sendStatus(HttpStatus.NOT_FOUND);
                return;
            }
            res.sendStatus(HttpStatus.INTERNAL_SERVER_ERROR);
        })
});

app.listen(port, () => console.log(`Server listening on port ${port}!`));