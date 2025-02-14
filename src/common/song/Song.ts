import pullAt from "lodash/pullAt"
import { action, computed, makeObservable, observable, transaction } from "mobx"
import { createModelSchema, list, object, primitive } from "serializr"
import { TIME_BASE } from "../../main/Constants"
import { isNotUndefined } from "../helpers/array"
import { Measure } from "../measure/Measure"
import { getMeasuresFromConductorTrack } from "../measure/MeasureList"
import Track from "../track"

const END_MARGIN = 480 * 30

export default class Song {
  tracks: Track[] = []
  selectedTrackId: number = 0
  filepath: string = ""
  timebase: number = TIME_BASE
  name: string = ""

  constructor() {
    makeObservable(this, {
      addTrack: action,
      removeTrack: action,
      selectTrack: action,
      insertTrack: action,
      conductorTrack: computed,
      selectedTrack: computed,
      measures: computed,
      endOfSong: computed,
      tracks: observable.shallow,
      selectedTrackId: observable,
      filepath: observable,
      timebase: observable,
    })
  }

  insertTrack(t: Track, index: number) {
    // 最初のトラックは Conductor Track なので channel を設定しない
    if (t.channel === undefined && this.tracks.length > 0) {
      t.channel = t.channel || this.tracks.length - 1
    }
    this.tracks.splice(index, 0, t)
  }

  addTrack(t: Track) {
    this.insertTrack(t, this.tracks.length)
  }

  removeTrack(id: number) {
    transaction(() => {
      pullAt(this.tracks, id)
      this.selectTrack(Math.min(id, this.tracks.length - 1))
    })
  }

  selectTrack(id: number) {
    if (id === this.selectedTrackId) {
      return
    }
    this.selectedTrackId = id
  }

  get conductorTrack(): Track | undefined {
    return this.tracks.find((t) => t.isConductorTrack)
  }

  get selectedTrack(): Track | undefined {
    return this.tracks[this.selectedTrackId]
  }

  getTrack(id: number): Track | undefined {
    return this.tracks[id]
  }

  get measures(): Measure[] {
    const conductorTrack = this.conductorTrack
    if (conductorTrack === undefined) {
      return []
    }
    return getMeasuresFromConductorTrack(conductorTrack, this.timebase)
  }

  get endOfSong(): number {
    const eos = Math.max(
      ...this.tracks.map((t) => t.endOfTrack).filter(isNotUndefined)
    )
    return (eos ?? 0) + END_MARGIN
  }
}

createModelSchema(Song, {
  tracks: list(object(Track)),
  selectedTrackId: primitive(),
  filepath: primitive(),
  timebase: primitive(),
})
