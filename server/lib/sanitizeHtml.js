const sanitizeHtml = require("sanitize-html");

const SANITIZE_OPTIONS = {
  allowedTags: ["p", "br", "b", "strong", "i", "em", "a", "img", "ul", "ol", "li"],
  allowedAttributes: { a: ["href"], img: ["src"] },
  allowedSchemesByTag: { img: ["data"] },
  allowedSchemes: ["http", "https"],
  transformTags: {
    a: sanitizeHtml.simpleTransform("a", { target: "_blank", rel: "noopener noreferrer nofollow" }),
  },
};

function sanitizeBody(raw) {
  return sanitizeHtml(raw, SANITIZE_OPTIONS);
}

module.exports = { SANITIZE_OPTIONS, sanitizeBody };
