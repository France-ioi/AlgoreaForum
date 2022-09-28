# AlgoreaForum

## Installation

```sh
npm ci
npx sls dynamodb install
```

## Start

```sh
npm start
```


## Test

```sh
npm test
```

## Deploy code on AWS

```sh
sls deploy [-f <function name>] --aws-profile <aws profile>
```

If you do global changes (for instance the role permissions), you need to deploy with specifying any function.