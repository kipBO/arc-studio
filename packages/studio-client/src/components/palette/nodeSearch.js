function normalize(value) {
  return String(value || '').normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

function tokenize(value) {
  return [...new Set(normalize(value).split(' ').filter(Boolean))];
}

function addPosting(index, key, itemIndex) {
  if (!key) return;
  let posting = index.get(key);
  if (!posting) index.set(key, posting = new Set());
  posting.add(itemIndex);
}

function bigrams(value) {
  const grams = new Set();
  for (let index = 0; index < value.length - 1; index += 1) grams.add(value.slice(index, index + 2));
  return grams;
}

function editDistanceAtMost(left, right, maximum) {
  if (Math.abs(left.length - right.length) > maximum) return maximum + 1;
  let previous = Array.from({ length: right.length + 1 }, (_, index) => index);
  for (let row = 1; row <= left.length; row += 1) {
    const current = [row];
    let rowMinimum = row;
    for (let column = 1; column <= right.length; column += 1) {
      const value = Math.min(
        current[column - 1] + 1,
        previous[column] + 1,
        previous[column - 1] + (left[row - 1] === right[column - 1] ? 0 : 1)
      );
      current[column] = value;
      rowMinimum = Math.min(rowMinimum, value);
    }
    if (rowMinimum > maximum) return maximum + 1;
    previous = current;
  }
  return previous[right.length];
}

function intersectPostings(postings) {
  if (!postings.length) return new Set();
  postings.sort((left, right) => left.size - right.size);
  const [smallest, ...rest] = postings;
  return new Set([...smallest].filter((itemIndex) => rest.every((posting) => posting.has(itemIndex))));
}

export function createSearchIndex(items, getFields = (item) => item.fields || []) {
  const records = items.map((item, index) => {
    const fields = getFields(item).map(normalize);
    const label = fields[0] || '';
    const terms = tokenize(fields.join(' '));
    return { item, index, label, text: fields.join(' '), terms };
  });
  const prefixPostings = new Map();
  const bigramWordPostings = new Map();
  const wordItems = new Map();

  for (const record of records) {
    for (const word of record.terms) {
      let posting = wordItems.get(word);
      if (!posting) wordItems.set(word, posting = new Set());
      posting.add(record.index);
      for (let length = 1; length <= Math.min(word.length, 32); length += 1) addPosting(prefixPostings, word.slice(0, length), record.index);
      if (word.length >= 3) for (const gram of bigrams(word)) addPosting(bigramWordPostings, gram, word);
    }
  }

  const candidatesForTerm = (term) => {
    const prefixMatches = prefixPostings.get(term.slice(0, 32));
    if (prefixMatches) return prefixMatches;
    if (term.length < 3) return new Set();

    const grams = bigrams(term);
    const similarWords = new Set();
    for (const gram of grams) for (const word of bigramWordPostings.get(gram) || []) similarWords.add(word);
    const maximumDistance = term.length <= 4 ? 1 : 2;
    const matchingWords = [...similarWords].filter((word) => editDistanceAtMost(term, word, maximumDistance) <= maximumDistance);
    return new Set(matchingWords.flatMap((word) => [...(wordItems.get(word) || [])]));
  };

  return {
    search(query, limit = 80, include = () => true) {
      const normalizedQuery = normalize(query);
      if (!normalizedQuery) return records.filter((record) => include(record.item)).slice(0, limit).map(({ item, index }) => ({ item, index, score: 1 }));
      const queryTerms = [...new Set(normalizedQuery.split(' ').filter(Boolean))];
      const candidatePostings = queryTerms.map(candidatesForTerm);
      const candidates = intersectPostings(candidatePostings);
      return [...candidates].filter((index) => include(records[index].item)).map((index) => {
        const record = records[index];
        const labelTerms = record.label.split(' ');
        const exactPhrase = record.label === normalizedQuery;
        const labelStartsWith = record.label.startsWith(normalizedQuery);
        const allTermsInLabel = queryTerms.every((term) => labelTerms.some((word) => word.startsWith(term)));
        const score = exactPhrase ? 1000 : labelStartsWith ? 900 : allTermsInLabel ? 800 : 500;
        return { item: record.item, index, score };
      }).sort((left, right) => right.score - left.score || left.index - right.index).slice(0, limit);
    }
  };
}
