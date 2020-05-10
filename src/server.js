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

const ajv = new Ajv(); // options can be passed, e.g. {allErrors: true}
const validator = ajv.compile(couponValidationSchema);

app.put("/coupon", (req, res) => {
    const isCouponValid = validator(req.body);
    if (!isCouponValid) {
        res.status(HttpStatus.BAD_REQUEST).json({errors: validator.errors});
        return;
    }
    db.collection("coupons").findOne({code: req.body.code})
        .then((coupon) => {
            if (coupon) {
                return Promise.reject(HttpStatus.CONFLICT)
            } else {
                req.body["updatedAt"] =  new Date().toISOString();
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

const updateValidator = ajv.compile(updateCouponValidation)
app.post("/coupon/:id", (req, res) => {
    const isCouponUpdateValid = updateValidator(req.body);
    if (!isCouponUpdateValid) {
        res.status(HttpStatus.BAD_REQUEST).json({errors: updateValidator.errors});
        return;
    }
    db.collection("coupons").findOne({_id: ObjectId(req.params.id)})
        .then((coupon) => {
            if (!coupon) {
                return Promise.reject(HttpStatus.NOT_FOUND);
            }
            if (coupon.updatedAt === req.body.updatedAt) {
                return db.collection("coupons").updateOne(
                    {_id: ObjectId(req.params.id)},
                    {$set: {
                        ...req.body,
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
            res.status(HttpStatus.OK).json({message: `The coupon with id: ${response.value._id} was deleted`});
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