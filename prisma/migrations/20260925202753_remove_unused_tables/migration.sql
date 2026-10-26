/*
  Warnings:

  - You are about to drop the `appointments` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `meta_api_keys` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `oauth_states` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `x_api_keys` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropForeignKey
ALTER TABLE "appointments" DROP CONSTRAINT "appointments_contact_id_fkey";

-- DropForeignKey
ALTER TABLE "meta_api_keys" DROP CONSTRAINT "meta_api_keys_api_key_id_fkey";

-- DropForeignKey
ALTER TABLE "x_api_keys" DROP CONSTRAINT "x_api_keys_api_key_id_fkey";

-- DropTable
DROP TABLE "appointments";

-- DropTable
DROP TABLE "meta_api_keys";

-- DropTable
DROP TABLE "oauth_states";

-- DropTable
DROP TABLE "x_api_keys";
