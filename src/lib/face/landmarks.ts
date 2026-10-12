/** MediaPipe Face Landmarker indices. Person's left is the viewer's right on an unmirrored photo. */

export const FACE_OVAL = [
  10, 338, 297, 332, 284, 251, 389, 356, 454, 323, 361, 288, 397, 365, 379, 378, 400, 377, 152, 148, 176, 149, 150, 136, 172, 58, 132, 93, 234, 127, 162, 21, 54, 103, 67, 109,
] as const;

export const LEFT_EYE = [249, 263, 362, 373, 374, 380, 381, 382, 384, 385, 386, 387, 388, 390, 398, 466] as const;
export const RIGHT_EYE = [7, 33, 133, 144, 145, 153, 154, 155, 157, 158, 159, 160, 161, 163, 173, 246] as const;
export const LEFT_BROW = [276, 282, 283, 285, 293, 295, 296, 300, 334, 336] as const;
export const RIGHT_BROW = [46, 52, 53, 55, 63, 65, 66, 70, 105, 107] as const;
export const LEFT_IRIS = [474, 475, 476, 477] as const;
export const RIGHT_IRIS = [469, 470, 471, 472] as const;
export const LIPS = [0, 13, 14, 17, 37, 39, 40, 61, 78, 80, 81, 82, 84, 87, 88, 91, 95, 146, 178, 181, 185, 191, 267, 269, 270, 291, 308, 310, 311, 312, 314, 317, 318, 321, 324, 375, 402, 405, 409, 415] as const;

export const NOSE_TIP = 1;
export const NOSE_BOTTOM = 2;
export const UPPER_LIP = 13;
export const LOWER_LIP = 14;
export const MOUTH_LEFT = 61;
export const MOUTH_RIGHT = 291;
export const CHIN = 152;
export const EAR_RIGHT = 234;
export const EAR_LEFT = 454;

export const NOSE_BLOB = [1, 2, 4, 5, 6, 19, 48, 49, 64, 94, 97, 98, 99, 168, 195, 197, 278, 279, 294, 326, 327, 328] as const;

/** Jaw from the person's left mouth side, under the chin, to the person's right. */
export const JAW = [397, 365, 379, 378, 400, 377, 152, 148, 176, 149, 150, 136, 172] as const;

export const LANDMARK_COUNT = 478;
