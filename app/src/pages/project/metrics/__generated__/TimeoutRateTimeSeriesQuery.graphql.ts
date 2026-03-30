/**
 * @generated SignedSource<<f3ac40a1623c5466dd0c19c113f7fe31>>
 * @lightSyntaxTransform
 * @nogrep
 */

/* tslint:disable */
/* eslint-disable */
// @ts-nocheck

import { ConcreteRequest } from 'relay-runtime';
export type SpanKind = "agent" | "chain" | "embedding" | "evaluator" | "guardrail" | "llm" | "prompt" | "reranker" | "retriever" | "tool" | "unknown";
export type TimeRange = {
  end?: string | null;
  start?: string | null;
};
export type TimeoutRateTimeSeriesQuery$variables = {
  filterCondition: string;
  projectId: string;
  timeRange: TimeRange;
};
export type TimeoutRateTimeSeriesQuery$data = {
  readonly project: {
    readonly spans?: {
      readonly edges: ReadonlyArray<{
        readonly node: {
          readonly attributes: string;
          readonly latencyMs: number | null;
          readonly spanKind: SpanKind;
          readonly startTime: string;
        };
      }>;
    };
  };
};
export type TimeoutRateTimeSeriesQuery = {
  response: TimeoutRateTimeSeriesQuery$data;
  variables: TimeoutRateTimeSeriesQuery$variables;
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
  "alias": null,
  "args": null,
  "kind": "ScalarField",
  "name": "attributes",
  "storageKey": null
},
v7 = {
  "alias": null,
  "args": null,
  "kind": "ScalarField",
  "name": "latencyMs",
  "storageKey": null
},
v8 = {
  "alias": null,
  "args": null,
  "kind": "ScalarField",
  "name": "startTime",
  "storageKey": null
},
v9 = {
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
    "name": "TimeoutRateTimeSeriesQuery",
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
    "name": "TimeoutRateTimeSeriesQuery",
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
                          (v8/*: any*/),
                          (v9/*: any*/)
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
          (v9/*: any*/)
        ],
        "storageKey": null
      }
    ]
  },
  "params": {
    "cacheID": "19cc9878af98e2b77e191fa59f2ec4e4",
    "id": null,
    "metadata": {},
    "name": "TimeoutRateTimeSeriesQuery",
    "operationKind": "query",
    "text": "query TimeoutRateTimeSeriesQuery(\n  $projectId: ID!\n  $timeRange: TimeRange!\n  $filterCondition: String!\n) {\n  project: node(id: $projectId) {\n    __typename\n    ... on Project {\n      spans(first: 1000, filterCondition: $filterCondition, timeRange: $timeRange, sort: {col: startTime, dir: asc}) {\n        edges {\n          node {\n            spanKind\n            attributes\n            latencyMs\n            startTime\n            id\n          }\n        }\n      }\n    }\n    id\n  }\n}\n"
  }
};
})();

(node as any).hash = "7ef947d4a6f0bbd6f846fb72164f6881";

export default node;
