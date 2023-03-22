const fs = require('fs');
const yaml = require('js-yaml');

const validateEnvAndArgs = () => {
  if (!process.argv[2]) throw new Error('No .json file specified in arguments');
  if (!process.env.AWS_REGION) throw new Error('No AWS_REGION specified in env');
  if (!process.env.AWS_ACCOUNT_ID) throw new Error('No AWS_ACCOUNT_ID specified in env');
};

// read file from disk, filepath from console argument
const inputFileContent = fs.readFileSync(process.argv[2], 'utf8').toString();
const inputJson = JSON.parse(inputFileContent);


const path = './handlers/';

const generateStepFunctionAndLambdas = (json) => {
  const elements = json.elements;
  const nodes = elements.nodes;
  const edges = elements.edges;

  let stateMachine = {
    StartAt: '',
    States: {},
  };

  const lambdaFunctions = {};

  const lambdaArn = `arn:aws:lambda:${process.env.AWS_REGION}:${process.env.AWS_ACCOUNT_ID}:function:`;

  nodes.forEach((node) => {
    const label = node.data.label.replace(/ /g, '');

    lambdaFunctions[label] = {
      handler: `${path}${label}.handler`,
      name: `${label}`,
      events: [
        {
          http: {
            path: label,
            method: 'post'
          }
        }
      ]
    };

    switch (node.type) {
      case 'input':
        stateMachine.StartAt = node.id;
        stateMachine.States[node.id] = {
          Type: 'Task',
          Resource: lambdaArn + label,
          Next: edges.find((edge) => edge.source === node.id).target,
        };
        break;
      case 'default':
        stateMachine.States[node.id] = {
          Type: 'Task',
          Resource: lambdaArn + label,
          Next: edges.find((edge) => edge.source === node.id).target,
        };
        break;
      case 'output':
        stateMachine.States[node.id] = {
          Type: 'Succeed',
        };
        break;
    }
  });

  edges.forEach((edge) => {
    if (edge.label) {
      const state = stateMachine.States[edge.source];
      if (!state.Choices) {
        state.Type = 'Choice';
        state.Choices = [];
        delete state.Resource;
        delete state.Next;
      }

      state.Choices.push({
        Variable: '$.result',
        StringEquals: edge.label,
        Next: edge.target,
      });
    }
  });

  return {
    stateMachine,
    lambdaFunctions
  };
};

const createEmptyHandlers = (lambdaFunctions) => {
  const isHandlersFolderExists = fs.existsSync(path);

  if (!isHandlersFolderExists) {
    fs.mkdirSync(path);
  }

  const template = (fs.readFileSync('./bin/templates/lambda.template.txt')).toString();

  for (const label of Object.keys(lambdaFunctions)) {
    console.log(label);
    fs.writeFileSync(`${path}/${label}.js`, template);
  }
};


validateEnvAndArgs();
const { stateMachine, lambdaFunctions } = generateStepFunctionAndLambdas(inputJson);

createEmptyHandlers(lambdaFunctions);

const stateMachineYaml = yaml.dump(stateMachine);
const lambdaFunctionsYaml = yaml.dump(lambdaFunctions, { indent: 2, noArrayIndent: true });

fs.writeFileSync('step-function-definition.yml', stateMachineYaml);
fs.writeFileSync('functions-definitions.yml', lambdaFunctionsYaml);