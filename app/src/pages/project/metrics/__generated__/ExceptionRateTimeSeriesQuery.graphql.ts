/**
 * @generated SignedSource<<338d0894653eb0c7c02dce8692c402ca>>
 * @lightSyntaxTransform
 * @nogrep
 */

/* tslint:disable */
/* eslint-disable */
// @ts-nocheck

import { ConcreteRequest } from 'relay-runtime';
export type SpanKind = "agent" | "chain" | "embedding" | "evaluator" | "guardrail" | "llm" | "prompt" | "reranker" | "retriever" | "tool" | "unknown";
export type SpanStatusCode = "ERROR" | "OK" | "UNSET";
export type TimeRange = {
  end?: string | null;
  start?: string | null;
};
export type ExceptionRateTimeSeriesQuery$variables = {
  filterCondition: string;
  projectId: string;
  timeRange: TimeRange;
};
export type ExceptionRateTimeSeriesQuery$data = {
  readonly project: {
    readonly spans?: {
      readonly edges: ReadonlyArray<{
        readonly node: {
          readonly spanKind: SpanKind;
          readonly startTime: string;
          readonly statusCode: SpanStatusCode;
        };
      }>;
    };
  };
};
export type ExceptionRateTimeSeriesQuery = {
  response: ExceptionRateTimeSeriesQuery$data;
  variables: ExceptionRateTimeSeriesQuery$variables;
};

const node: ConcreteRequest = (function(){
var v0 = {
  "defaultValue": null,
  "kind": "LocalArgument",
  "name": "filterCondition"
},
v1 = {
  "defaultValue": null,
  "kind": "LocalArgument",
  "name": "projectId"
},
v2 = {
  "defaultValue": null,
  "kind": "LocalArgument",
  "name": "timeRange"
},
v3 = [
  {
    "kind": "Variable",
    "name": "id",
    "variableName": "projectId"
  }
],
v4 = [
  {
    "kind": "Variable",
    "name": "filterCondition",
    "variableName": "filterCondition"
  },
  {
    "kind": "Literal",
    "name": "first",
    "value": 1000
  },
  {
    "kind": "Literal",
    "name": "sort",
    "value": {
      "col": "startTime",
      "dir": "asc"
    }
  },
  {
    "kind": "Variable",
    "name": "timeRange",
    "variableName": "timeRange"
  }
],
v5 = {
  "alias": null,
  "args": null,
  "kind": "ScalarField",
  "name": "spanKind",
  "storageKey": null
},
v6 = {
  "alias": "statusCode",
  "args": null,
  "kind": "ScalarField",
  "name": "propagatedStatusCode",
  "storageKey": null
},
v7 = {
  "alias": null,
  "args": null,
  "kind": "ScalarField",
  "name": "startTime",
  "storageKey": null
},
v8 = {
  "alias": null,
  "args": null,
  "kind": "ScalarField",
  "name": "id",
  "storageKey": null
};
return {
  "fragment": {
    "argumentDefinitions": [
      (v0/*: any*/),
      (v1/*: any*/),
      (v2/*: any*/)
    ],
    "kind": "Fragment",
    "metadata": null,
    "name": "ExceptionRateTimeSeriesQuery",
    "selections": [
      {
        "alias": "project",
        "args": (v3/*: any*/),
        "concreteType": null,
        "kind": "LinkedField",
        "name": "node",
        "plural": false,
        "selections": [
          {
            "kind": "InlineFragment",
            "selections": [
              {
                "alias": null,
                "args": (v4/*: any*/),
                "concreteType": "SpanConnection",
                "kind": "LinkedField",
                "name": "spans",
                "plural": false,
                "selections": [
                  {
                    "alias": null,
                    "args": null,
                    "concreteType": "SpanEdge",
                    "kind": "LinkedField",
                    "name": "edges",
                    "plural": true,
                    "selections": [
                      {
                        "alias": null,
                        "args": null,
                        "concreteType": "Span",
                        "kind": "LinkedField",
                        "name": "node",
                        "plural": false,
                        "selections": [
                          (v5/*: any*/),
                          (v6/*: any*/),
                          (v7/*: any*/)
                        ],
                        "storageKey": null
                      }
                    ],
                    "storageKey": null
                  }
                ],
                "storageKey": null
              }
            ],
            "type": "Project",
            "abstractKey": null
          }
        ],
        "storageKey": null
      }
    ],
    "type": "Query",
    "abstractKey": null
  },
  "kind": "Request",
  "operation": {
    "argumentDefinitions": [
      (v1/*: any*/),
      (v2/*: any*/),
      (v0/*: any*/)
    ],
    "kind": "Operation",
    "name": "ExceptionRateTimeSeriesQuery",
    "selections": [
      {
        "alias": "project",
        "args": (v3/*: any*/),
        "concreteType": null,
        "kind": "LinkedField",
        "name": "node",
        "plural": false,
        "selections": [
          {
            "alias": null,
            "args": null,
            "kind": "ScalarField",
            "name": "__typename",
            "storageKey": null
          },
          {
            "kind": "InlineFragment",
            "selections": [
              {
                "alias": null,
                "args": (v4/*: any*/),
                "concreteType": "SpanConnection",
                "kind": "LinkedField",
                "name": "spans",
                "plural": false,
                "selections": [
                  {
                    "alias": null,
                    "args": null,
                    "concreteType": "SpanEdge",
                    "kind": "LinkedField",
                    "name": "edges",
                    "plural": true,
                    "selections": [
                      {
                        "alias": null,
                        "args": null,
                        "concreteType": "Span",
                        "kind": "LinkedField",
                        "name": "node",
                        "plural": false,
                        "selections": [
                          (v5/*: any*/),
                          (v6/*: any*/),
                          (v7/*: any*/),
                          (v8/*: any*/)
                        ],
                        "storageKey": null
                      }
                    ],
                    "storageKey": null
                  }
                ],
                "storageKey": null
              }
            ],
            "type": "Project",
            "abstractKey": null
          },
          (v8/*: any*/)
        ],
        "storageKey": null
      }
    ]
  },
  "params": {
    "cacheID": "63898cbf097cd847b58df85c83ecff66",
    "id": null,
    "metadata": {},
    "name": "ExceptionRateTimeSeriesQuery",
    "operationKind": "query",
    "text": "query ExceptionRateTimeSeriesQuery(\n  $projectId: ID!\n  $timeRange: TimeRange!\n  $filterCondition: String!\n) {\n  project: node(id: $projectId) {\n    __typename\n    ... on Project {\n      spans(first: 1000, filterCondition: $filterCondition, timeRange: $timeRange, sort: {col: startTime, dir: asc}) {\n        edges {\n          node {\n            spanKind\n            statusCode: propagatedStatusCode\n            startTime\n            id\n          }\n        }\n      }\n    }\n    id\n  }\n}\n"
  }
};
})();

(node as any).hash = "45582b154ae192f775077a29652129c5";

export default node;
