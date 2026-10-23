export default {
  "description": "Splits text at each exact separator string. Connect Part 1, Part 2, and more as needed, each used output reveals the next socket. It does not parse command prefixes or quoted arguments.",
  "type": "data_string_split",
  "category": "Values & Data",
  "label": "Split Text",
  "color": "#06b6d4",
  "inputs": [
    {
      "id": "text",
      "label": "Text",
      "type": "string",
      "defaultValue": ""
    },
    {
      "id": "separator",
      "label": "Separator",
      "type": "string",
      "defaultValue": ","
    }
  ],
  "outputs": [
    {
      "id": "array",
      "label": "Parts",
      "type": "object"
    },
    {
      "id": "length",
      "label": "Count",
      "type": "number"
    }
  ]
};
