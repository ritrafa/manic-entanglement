"use server";

import fs from "fs";

export async function getFile() {

    const file = fs.createReadStream('image2.png')

    return file


  };

