// TypeScript declarations for Phaser 3
// Provided for hermetic builds when @types/phaser is unavailable in npm registry.

declare namespace Phaser {
  export const AUTO: number;
  export const CANVAS: number;
  export const WEBGL: number;

  export namespace Types {
    export namespace Core {
      export interface GameConfig {
        type?: number;
        parent?: string | HTMLElement | null;
        width?: number | string;
        height?: number | string;
        scene?: any;
        backgroundColor?: string | number;
        pixelArt?: boolean;
        roundPixels?: boolean;
        transparent?: boolean;
        physics?: any;
        scale?: any;
        render?: any;
        audio?: any;
        dom?: any;
        fps?: any;
        [key: string]: any;
      }
    }
  }

  export namespace Events {
    export class EventEmitter {
      on(event: string | symbol, fn: Function, context?: any): this;
      once(event: string | symbol, fn: Function, context?: any): this;
      off(event: string | symbol, fn?: Function, context?: any, once?: boolean): this;
      emit(event: string | symbol, ...args: any[]): boolean;
      shutdown(): void;
      destroy(): void;
    }
  }

  export namespace Scenes {
    export namespace Events {
      export const BOOT: string;
      export const CREATE: string;
      export const DESTROY: string;
      export const PAUSE: string;
      export const POST_UPDATE: string;
      export const PRE_RENDER: string;
      export const PRE_UPDATE: string;
      export const READY: string;
      export const RENDER: string;
      export const RESUME: string;
      export const SHUTDOWN: string;
      export const SLEEP: string;
      export const START: string;
      export const TRANSITION_COMPLETE: string;
      export const TRANSITION_INIT: string;
      export const TRANSITION_OUT: string;
      export const TRANSITION_START: string;
      export const TRANSITION_WAKE: string;
      export const UPDATE: string;
      export const WAKE: string;
    }
  }

  export namespace Input {
    export class Pointer {
      id: number;
      x: number;
      y: number;
      worldX: number;
      worldY: number;
      isDown: boolean;
      downX: number;
      downY: number;
      upX: number;
      upY: number;
      velocity: any;
      camera: any;
      [key: string]: any;
    }

    export class InputPlugin extends Events.EventEmitter {
      keyboard?: any;
      mousePointer?: Pointer;
      pointer1?: Pointer;
      pointer2?: Pointer;
      activePointer?: Pointer;
      enabled: boolean;
      setDraggable(gameObjects: any | any[], value?: boolean): this;
      setHitArea(gameObjects: any | any[], shape?: any, callback?: Function): this;
      [key: string]: any;
    }
  }

  export namespace Cameras {
    export namespace Scene2D {
      export class Camera extends Events.EventEmitter {
        x: number;
        y: number;
        width: number;
        height: number;
        scrollX: number;
        scrollY: number;
        zoom: number;
        worldView: { x: number; y: number; width: number; height: number; contains(x: number, y: number): boolean };
        setBackgroundColor(color?: string | number): this;
        setBounds(x: number, y: number, width: number, height: number, centerOn?: boolean): this;
        setZoom(zoom: number): this;
        centerOn(x: number, y: number): this;
        startFollow(target: any, roundPixels?: boolean, lerpX?: number, lerpY?: number, offsetX?: number, offsetY?: number): this;
        stopFollow(): this;
        setDeadzone(width?: number, height?: number): this;
        setLerp(x?: number, y?: number): this;
        pan(x: number, y: number, duration?: number, ease?: string | Function, force?: boolean, callback?: Function, context?: any): this;
        zoomTo(zoom: number, duration?: number, ease?: string | Function, force?: boolean, callback?: Function, context?: any): this;
        getWorldPoint(x: number, y: number, output?: any): any;
        destroy(): void;
        [key: string]: any;
      }

      export class CameraManager {
        main: Camera;
        cameras: Camera[];
        add(x?: number, y?: number, width?: number, height?: number, makeMain?: boolean, name?: string): Camera;
        remove(camera: Camera | Camera[]): number;
        resize(width: number, height: number): void;
        [key: string]: any;
      }
    }
  }

  export namespace Scale {
    export const NO_SCALE: number;
    export const EXACT_FIT: number;
    export const FIT: number;
    export const ENVELOP: number;
    export const RESIZE: number;
    export const CENTER_BOTH: number;
    export const CENTER_HORIZONTALLY: number;
    export const CENTER_VERTICALLY: number;

    export class ScaleManager extends Events.EventEmitter {
      width: number;
      height: number;
      parent: any;
      mode: number;
      autoCenter: number;
      resize(width: number, height: number): this;
      setGameSize(width: number, height: number): this;
      [key: string]: any;
    }
  }

  export namespace Textures {
    export class TextureManager extends Events.EventEmitter {
      exists(key: string): boolean;
      generate(key: string, config: any): boolean;
      addImage(key: string, source: HTMLImageElement | HTMLCanvasElement): any;
      addCanvas(key: string, source: HTMLCanvasElement): any;
      get(key: string): any;
      remove(key: string): this;
      [key: string]: any;
    }
  }

  export namespace Display {
    export class Color {
      static IntegerToRGB(color: number): { r: number; g: number; b: number; a: number };
      static HexStringToColor(hex: string): Color;
      static ValueToColor(input: string | number | object): Color;
      r: number;
      g: number;
      b: number;
      a: number;
      color: number;
      constructor(red?: number, green?: number, blue?: number, alpha?: number);
      [key: string]: any;
    }
  }

  export namespace Math {
    export function Between(min: number, max: number): number;
    export function Clamp(value: number, min: number, max: number): number;
  }

  export namespace GameObjects {
    export namespace Components {
      export interface Transform {
        x: number;
        y: number;
        z: number;
        w: number;
        scaleX: number;
        scaleY: number;
        angle: number;
        rotation: number;
        setPosition(x?: number, y?: number, z?: number, w?: number): this;
        setScale(x: number, y?: number): this;
        setAngle(degrees?: number): this;
        setRotation(radians?: number): this;
      }
    }

    export class GameObject extends Events.EventEmitter {
      type: string;
      name: string;
      active: boolean;
      visible: boolean;
      scene: Scene;
      parentContainer?: Container;
      data?: any;
      input?: any;
      setActive(value: boolean): this;
      setName(value: string): this;
      setVisible(value: boolean): this;
      setInteractive(hitArea?: any, callback?: Function, dropZone?: boolean): this;
      disableInteractive(): this;
      destroy(fromScene?: boolean): void;
      [key: string]: any;
    }

    export class Graphics extends GameObject {
      x: number;
      y: number;
      clear(): this;
      fillStyle(color: number, alpha?: number): this;
      lineStyle(lineWidth: number, color: number, alpha?: number): this;
      fillRect(x: number, y: number, width: number, height: number): this;
      strokeRect(x: number, y: number, width: number, height: number): this;
      fillCircle(x: number, y: number, radius: number): this;
      strokeCircle(x: number, y: number, radius: number): this;
      fillRoundedRect(x: number, y: number, width: number, height: number, radius?: number | object): this;
      strokeRoundedRect(x: number, y: number, width: number, height: number, radius?: number | object): this;
      beginPath(): this;
      moveTo(x: number, y: number): this;
      lineTo(x: number, y: number): this;
      strokePath(): this;
      fillPath(): this;
      closePath(): this;
      setDepth(value: number): this;
      setPosition(x?: number, y?: number): this;
      setScrollFactor(x: number, y?: number): this;
      setAlpha(value?: number): this;
      [key: string]: any;
    }

    export class Group extends GameObject {
      children: any;
      add(child: GameObject, addToScene?: boolean): this;
      addMultiple(children: GameObject[], addToScene?: boolean): this;
      remove(child: GameObject, removeFromScene?: boolean, destroyChild?: boolean): this;
      clear(removeFromScene?: boolean, destroyChild?: boolean): this;
      destroy(destroyChildren?: boolean, removeFromScene?: boolean): void;
      [key: string]: any;
    }

    export class Shape extends GameObject {
      x: number;
      y: number;
      width: number;
      height: number;
      fillColor: number;
      fillAlpha: number;
      setDepth(value: number): this;
      setPosition(x?: number, y?: number): this;
      setFillStyle(color?: number, alpha?: number): this;
      setStrokeStyle(lineWidth?: number, color?: number, alpha?: number): this;
      setOrigin(x?: number, y?: number): this;
      setScrollFactor(x: number, y?: number): this;
      setAlpha(value?: number): this;
      [key: string]: any;
    }

    export class Rectangle extends Shape {}
    export class Arc extends Shape {}
    export class Ellipse extends Shape {}

    export class Text extends GameObject {
      x: number;
      y: number;
      text: string;
      style: any;
      width: number;
      height: number;
      setText(value: string | string[]): this;
      setStyle(style: object): this;
      setFontSize(fontSize: number | string): this;
      setColor(color: string): this;
      setDepth(value: number): this;
      setOrigin(x?: number, y?: number): this;
      setPosition(x?: number, y?: number): this;
      setScrollFactor(x: number, y?: number): this;
      setAlpha(value?: number): this;
      [key: string]: any;
    }

    export class Image extends GameObject {
      x: number;
      y: number;
      width: number;
      height: number;
      setDepth(value: number): this;
      setPosition(x?: number, y?: number): this;
      setOrigin(x?: number, y?: number): this;
      setScale(x: number, y?: number): this;
      setTint(topOrAll?: number, topRight?: number, bottomLeft?: number, bottomRight?: number): this;
      clearTint(): this;
      setTexture(key: string, frame?: string | number): this;
      setScrollFactor(x: number, y?: number): this;
      setAlpha(value?: number): this;
      [key: string]: any;
    }

    export class Sprite extends Image {
      play(key: string | object, ignoreIfPlaying?: boolean): this;
      stop(): this;
      [key: string]: any;
    }

    export class Container extends GameObject {
      x: number;
      y: number;
      list: GameObject[];
      add(child: GameObject | GameObject[]): this;
      remove(child: GameObject | GameObject[], destroyChild?: boolean): this;
      removeAll(destroyChild?: boolean): this;
      setDepth(value: number): this;
      setPosition(x?: number, y?: number): this;
      setScale(x: number, y?: number): this;
      setAlpha(value?: number): this;
      setScrollFactor(x: number, y?: number): this;
      [key: string]: any;
    }

    export namespace Particles {
      export class ParticleEmitter extends GameObject {
        start(): this;
        stop(): this;
        explode(count?: number, x?: number, y?: number): void;
        [key: string]: any;
      }
    }

    export class GameObjectFactory {
      scene: Scene;
      graphics(config?: any): Graphics;
      group(children?: any, config?: any): Group;
      rectangle(x: number, y: number, width: number, height: number, fillColor?: number, fillAlpha?: number): Rectangle;
      circle(x: number, y: number, radius: number, fillColor?: number, fillAlpha?: number): Arc;
      ellipse(x: number, y: number, width: number, height: number, fillColor?: number, fillAlpha?: number): Ellipse;
      text(x: number, y: number, text: string | string[], style?: object): Text;
      image(x: number, y: number, texture: string, frame?: string | number): Image;
      sprite(x: number, y: number, texture: string, frame?: string | number): Sprite;
      container(x?: number, y?: number, children?: GameObject | GameObject[]): Container;
      particles(x?: number, y?: number, texture?: string, config?: any): any;
      existing<T extends GameObject>(child: T): T;
      [key: string]: any;
    }
  }

  export class Scene {
    sys: any;
    game: Game;
    add: GameObjects.GameObjectFactory;
    make: any;
    cameras: Cameras.Scene2D.CameraManager;
    events: Events.EventEmitter;
    input: Input.InputPlugin;
    load: any;
    scale: Scale.ScaleManager;
    sound: any;
    textures: Textures.TextureManager;
    time: any;
    tweens: any;
    physics?: any;
    constructor(config?: string | any);
    init(data?: any): void;
    preload(): void;
    create(data?: any): void;
    update(time: number, delta: number): void;
    [key: string]: any;
  }

  export class Game {
    config: any;
    renderer: any;
    events: Events.EventEmitter;
    scene: any;
    scale: Scale.ScaleManager;
    sound: any;
    textures: Textures.TextureManager;
    input: any;
    isBooted: boolean;
    isRunning: boolean;
    canvas: HTMLCanvasElement;
    context: CanvasRenderingContext2D | WebGLRenderingContext;
    constructor(GameConfig?: Types.Core.GameConfig);
    destroy(removeCanvas: boolean, noReturn?: boolean): void;
    step(time: number, delta: number): void;
    [key: string]: any;
  }
}

declare module "phaser" {
  export = Phaser;
}
