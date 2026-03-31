interface FL {
    configURI: string;

    getDocumentDOM: () => Document;
    trace: (msg: object) => void;
}


interface Document {
    name: string;
}


declare const fl: FL;