// モデルに与えるノートとタグにそれぞれ prefix をつける必要がある
// これがついた状態でベクトル変換されることで、ノートとタグの類似度比較が正しく機能する
export const NOTE_PREFIX = "title: none | text: ";
export const TAG_PREFIX = "task: search result | query: ";
