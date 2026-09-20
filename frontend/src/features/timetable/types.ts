export type Parity="all"|"odd"|"even";
export type Meeting={day:number;start_period:number;end_period:number;start_week:number;end_week:number;parity:Parity;teacher:string;location:string};
export type CourseInput={code:string;title:string;class_name:string;campus:string;meetings:Meeting[]};
export type Course=CourseInput&{id:string;version:number};
export type Settings={week_one_monday:string|null;total_weeks:number;version:number};
export type ParseError={line:number;text:string;message:string};

export const blankMeeting=():Meeting=>({day:1,start_period:1,end_period:2,start_week:1,end_week:20,parity:"all",teacher:"",location:""});
export const blankCourse=():CourseInput=>({code:"",title:"",class_name:"",campus:"",meetings:[blankMeeting()]});
