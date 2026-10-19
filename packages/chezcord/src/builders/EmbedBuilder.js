export class EmbedBuilder {
  constructor(data = {}) {
    this.data = {
      title: data.title ?? undefined,
      description: data.description ?? undefined,
      url: data.url ?? undefined,
      timestamp: data.timestamp ?? undefined,
      color: data.color ?? undefined,
      footer: data.footer ?? undefined,
      image: data.image ?? undefined,
      thumbnail: data.thumbnail ?? undefined,
      author: data.author ?? undefined,
      fields: data.fields ? [...data.fields] : []
    };
  }

  setTitle(title) {
    this.data.title = String(title).slice(0, 256);
    return this;
  }

  setDescription(description) {
    this.data.description = String(description).slice(0, 4096);
    return this;
  }

  setURL(url) {
    this.data.url = url;
    return this;
  }

  setColor(color) {
    if (typeof color === 'string') {
      this.data.color = parseInt(color.replace(/^#/, ''), 16);
    } else {
      this.data.color = Number(color);
    }
    return this;
  }

  setTimestamp(timestamp = new Date()) {
    this.data.timestamp = timestamp instanceof Date ? timestamp.toISOString() : new Date(timestamp).toISOString();
    return this;
  }

  setFooter(footer) {
    this.data.footer = {
      text: String(footer.text).slice(0, 2048),
      icon_url: footer.iconURL || footer.icon_url
    };
    return this;
  }

  setImage(url) {
    this.data.image = { url };
    return this;
  }

  setThumbnail(url) {
    this.data.thumbnail = { url };
    return this;
  }

  setAuthor(author) {
    this.data.author = {
      name: String(author.name).slice(0, 256),
      url: author.url,
      icon_url: author.iconURL || author.icon_url
    };
    return this;
  }

  addField(name, value, inline = false) {
    this.data.fields.push({
      name: String(name).slice(0, 256),
      value: String(value).slice(0, 1024),
      inline: Boolean(inline)
    });
    return this;
  }

  addFields(...fields) {
    for (const f of fields.flat()) {
      this.addField(f.name, f.value, f.inline);
    }
    return this;
  }

  toJSON() {
    const payload = {};
    for (const [key, val] of Object.entries(this.data)) {
      if (val !== undefined && val !== null) {
        if (Array.isArray(val) && val.length === 0) continue;
        payload[key] = val;
      }
    }
    return payload;
  }
}
