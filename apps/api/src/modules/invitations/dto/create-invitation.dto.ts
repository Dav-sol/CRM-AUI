import { IsEmail, IsString } from 'class-validator';

export class CreateInvitationDto {
  @IsEmail()
  email!: string;

  @IsString()
  roleId!: string;

  @IsString()
  organizationId!: string;
}
